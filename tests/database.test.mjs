import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { test, after } from 'node:test'

const db = new PGlite()
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated; grant execute on function auth.uid(),auth.jwt() to anon,authenticated;`)
// Minimal Storage schema for exercising the bucket migration and write policies.
await db.exec(`create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated;
grant all on storage.objects to anon,authenticated;
create policy existing_bucket_writes on storage.objects for all to anon,authenticated using(true) with check(true);`)
for (const file of (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((f) => f.endsWith('.sql'))
  .sort())
  await db
    .exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'))
    .catch((error) => {
      throw new Error(`Migration ${file}: ${error.message} at character ${error.position}`)
    })
const admin = randomUUID(),
  tutor = randomUUID(),
  otherTutor = randomUUID(),
  learner = randomUUID(),
  otherLearner = randomUUID()
for (const id of [admin, tutor, otherTutor, learner, otherLearner])
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)`, [
    id,
    `${id}@example.test`,
    { name: 'Test User', role: 'admin' },
  ])
await db.query(`update public.profiles set role='admin' where id=$1`, [admin])
await db.query(`update public.profiles set role='tutor' where id=any($1::uuid[])`, [
  [tutor, otherTutor],
])
assert.deepEqual(
  (await db.query('select name from public.categories order by name')).rows.map((row) => row.name),
  ['Cloud & DevSecOps', 'Cybersecurity', 'IT Audit & SOX', 'Risk & Governance'],
)
await db.query(`insert into public.categories values('Testing')`)
async function as(id, role = 'authenticated') {
  await db.exec('reset role')
  if (id)
    await db.query(
      'insert into auth.sessions(id,user_id) select id,id from auth.users where id=$1 on conflict do nothing',
      [id],
    )
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id || ''])
  await db.query(`select set_config('request.jwt.claim.session_id',$1,false)`, [id || ''])
  await db.exec(`set role ${role}`)
}
const cid = randomUUID(),
  mid = randomUUID(),
  lid = randomUUID(),
  qid = randomUUID(),
  questionId = randomUUID(),
  correctId = randomUUID(),
  incorrectId = randomUUID()
const course = {
  id: cid,
  tutorId: tutor,
  title: 'Test course',
  description: 'Real content',
  category: 'Testing',
  level: 'Beginner',
  status: 'published',
  price: 0,
  duration: 1,
  thumbnail: '',
  tags: [],
  updatedAt: new Date().toISOString(),
  modules: [
    {
      id: mid,
      title: 'Module',
      lessons: [
        {
          id: lid,
          title: 'Lesson',
          duration: 5,
          type: 'reading',
          content: 'PRIVATE LESSON CONTENT',
          videoUrl: '',
        },
      ],
    },
  ],
}
test('course slugs are generated uniquely, immutable through upserts, reserved-route safe and RLS protected', async () => {
  await as(tutor)
  const ids = []
  for (const title of [
    'Cybersecurity fundamentals',
    'Cybersecurity fundamentals',
    'AI',
    '网络安全',
    "Robert'); DROP TABLE courses; --",
  ]) {
    const id = randomUUID()
    ids.push(id)
    await db.query("select public.lms_command('saveCourse',$1::jsonb)", [
      { ...course, id, title, status: 'draft', modules: [] },
    ])
  }
  const rows = (
    await db.query(
      'select id,slug,updated_at::text as revision from public.courses where id=any($1::uuid[])',
      [ids],
    )
  ).rows
  const slug = (id) => rows.find((row) => row.id === id).slug
  assert.equal(slug(ids[0]), 'cybersecurity-fundamentals')
  assert.match(slug(ids[1]), /^cybersecurity-fundamentals-[a-f0-9]{8}$/)
  assert.equal(slug(ids[2]), 'course-ai')
  assert.equal(slug(ids[3]), 'course')
  assert.match(slug(ids[4]), /^robert-drop-table-courses$/)
  assert.equal(new Set(rows.map((row) => row.slug)).size, ids.length)
  await db.query("select public.lms_command('saveCourse',$1::jsonb)", [
    {
      ...course,
      id: ids[0],
      title: 'Renamed course',
      status: 'draft',
      modules: [],
      updatedAt: rows.find((row) => row.id === ids[0]).revision,
    },
  ])
  assert.equal(
    (await db.query('select slug from public.courses where id=$1', [ids[0]])).rows[0].slug,
    slug(ids[0]),
  )
  const cards = (await db.query("select public.browse_courses('managed') as page")).rows[0].page
    .courses
  assert.ok(cards.some((c) => c.id === ids[0] && c.slug === slug(ids[0])))
  await as(learner)
  assert.equal(
    (await db.query('select id from public.courses where slug=$1', [slug(ids[0])])).rows.length,
    0,
  )
  await as(otherTutor)
  assert.equal(
    (await db.query('select id from public.courses where slug=$1', [slug(ids[0])])).rows.length,
    0,
  )
  await db.exec('reset role')
  await db.query("update public.courses set slug='hijacked' where id=$1", [ids[0]])
  assert.equal(
    (await db.query('select slug from public.courses where id=$1', [ids[0]])).rows[0].slug,
    slug(ids[0]),
  )
  await db.query('delete from public.courses where id=any($1::uuid[])', [ids])
})

test('thumbnail bucket enforces server-only writes even alongside broader storage policies', async () => {
  const bucket = (await db.query("select * from storage.buckets where id='course-thumbnails'"))
    .rows[0]
  assert.equal(bucket.public, true)
  assert.equal(Number(bucket.file_size_limit), 5242880)
  for (const uid of [admin, tutor, learner]) {
    await as(uid)
    await assert.rejects(
      db.query(
        "insert into storage.objects(id,bucket_id,name) values($1,'course-thumbnails','bypass.webp')",
        [randomUUID()],
      ),
      /row-level security/,
    )
    await db.query(
      "insert into storage.objects(id,bucket_id,name) values($1,'other-bucket','allowed.txt')",
      [randomUUID()],
    )
  }
  await db.exec('reset role')
})

test('signup metadata cannot grant administrator access', async () => {
  await as(learner)
  const { rows } = await db.query(`select role from public.profiles where id=$1`, [learner])
  assert.equal(rows[0].role, 'learner')
  await assert.rejects(
    db.query(`update public.profiles set role='admin' where id=$1`, [learner]),
    /permission denied/,
  )
  await assert.rejects(
    db.query(`select public.lms_command('profile',$1)`, [
      { id: tutor, name: 'Hacked', role: 'admin', isActive: true },
    ]),
    /denied/,
  )
})
test('public signups stay learners until an administrator assigns a tutor role', async () => {
  await db.exec('reset role')
  const uid = randomUUID()
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
    uid,
    `${uid}@example.test`,
    { name: 'Public Signup', role: 'tutor' },
  ])
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [uid])).rows[0].role,
    'learner',
  )
  await as(uid)
  await db.query(`select public.lms_command('profile',$1)`, [
    { id: uid, name: 'Public Signup', role: 'tutor', isActive: true },
  ])
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [uid])).rows[0].role,
    'learner',
  )
  await as(admin)
  await db.query(`select public.lms_command('profile',$1)`, [
    { id: uid, name: 'Admin-appointed Tutor', role: 'tutor', isActive: true },
  ])
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [uid])).rows[0].role,
    'tutor',
  )
})
test('tutor draft lifecycle preserves incomplete work, supports edits and validates publication', async () => {
  const draftId = randomUUID()
  const draft = { ...course, id: draftId, description: '', status: 'draft', modules: [] }
  await as(tutor)
  await db.query(`select public.lms_command('saveCourse',$1)`, [draft])
  const reload = async () =>
    (await db.query('select * from public.courses where id=$1', [draftId])).rows[0]
  const first = await reload()
  assert.equal(first.status, 'draft')
  assert.equal(first.description, '')
  draft.updatedAt = first.updated_at
  draft.modules = [{ id: randomUUID(), title: '', lessons: [] }]
  await db.query(`select public.lms_command('saveCourse',$1)`, [draft])
  assert.equal(
    (await db.query('select public.course_outlines($1::uuid[]) result', [[draftId]])).rows[0]
      .result[0].modules.length,
    1,
  )
  await assert.rejects(
    db.query(`select public.lms_command('saveCourse',$1)`, [draft]),
    /another session/,
  )
  draft.updatedAt = (await reload()).updated_at
  await assert.rejects(
    db.query(`select public.lms_command('saveCourse',$1)`, [{ ...draft, status: 'published' }]),
    /description/,
  )
  draft.description = 'Learn security'
  await assert.rejects(
    db.query(`select public.lms_command('saveCourse',$1)`, [{ ...draft, status: 'published' }]),
    /Complete module/,
  )
  await as(null, 'anon')
  assert.equal(
    (await db.query('select id from public.courses where id=$1', [draftId])).rows.length,
    0,
  )
  await as(otherTutor)
  await assert.rejects(db.query(`select public.lms_command('saveCourse',$1)`, [draft]), /denied/)
  await as(tutor)
  draft.modules = [
    {
      id: randomUUID(),
      title: 'Introduction',
      lessons: [
        {
          id: randomUUID(),
          title: 'Security basics',
          type: 'reading',
          duration: 10,
          content: 'Saved lesson content',
          videoUrl: '',
        },
      ],
    },
  ]
  await db.query(`select public.lms_command('saveCourse',$1)`, [{ ...draft, status: 'published' }])
  assert.equal((await reload()).status, 'published')
  draft.updatedAt = (await reload()).updated_at
  await db.query(`select public.lms_command('saveCourse',$1)`, [{ ...draft, status: 'archived' }])
  assert.equal((await reload()).status, 'archived')
  await db.exec('reset role')
  await db.query('delete from public.courses where id=$1', [draftId])
})

test('tutor saves normalized curriculum atomically', async () => {
  await as(tutor)
  await db.query(`select public.lms_command('saveCourse',$1)`, [course])
  const { rows } = await db.query(`select public.course_outlines($1::uuid[]) result`, [[cid]])
  assert.equal(rows[0].result[0].modules[0].lessons[0].content, 'PRIVATE LESSON CONTENT')
})
test('course authoring saves return a revision atomically for continuing after resource uploads', async () => {
  await as(tutor)
  const token = (await db.query('select updated_at from public.courses where id=$1', [cid])).rows[0]
    .updated_at
  const saved = (
    await db.query('select public.save_course_with_revision($1) result', [
      { ...course, updatedAt: token },
    ])
  ).rows[0].result
  const next = (await db.query('select updated_at from public.courses where id=$1', [cid])).rows[0]
    .updated_at
  assert.equal(new Date(saved.updatedAt).getTime(), new Date(next).getTime())
  await db.query('select public.save_course_with_revision($1)', [
    { ...course, updatedAt: saved.updatedAt },
  ])
  await assert.rejects(
    db.query('select public.save_course_with_revision($1)', [
      { ...course, updatedAt: saved.updatedAt },
    ]),
    /another session/,
  )
})
test('private PDF resource registration requires course ownership and an uploaded object', async () => {
  await as(tutor)
  const id = randomUUID(),
    path = `${cid}/${lid}/${id}.pdf`
  assert.equal(
    (
      await db.query("select public.lesson_resource_command('prepare',$1) result", [
        { lessonId: lid },
      ])
    ).rows[0].result.courseId,
    cid,
  )
  const payload = { id, lessonId: lid, path, name: 'Lesson reference.pdf', bytes: 1000, pages: 2 }
  await assert.rejects(
    db.query("select public.lesson_resource_command('add',$1)", [payload]),
    /Upload the PDF/,
  )
  await db.exec('reset role')
  await db.query('insert into storage.objects(id,bucket_id,name) values($1,$2,$3)', [
    randomUUID(),
    'lesson-resources',
    path,
  ])
  await as(otherTutor)
  await assert.rejects(
    db.query("select public.lesson_resource_command('add',$1)", [payload]),
    /denied/,
  )
  await as(tutor)
  await assert.rejects(
    db.query("select public.lesson_resource_command('add',$1)", [
      { ...payload, path: 'another-course/file.pdf' },
    ]),
    /Invalid resource path/,
  )
  await db.query("select public.lesson_resource_command('add',$1)", [payload])
  await as(learner)
  await assert.rejects(
    db.query("select public.lesson_resource_command('list',$1)", [{ lessonId: lid }]),
    /Enrollment/,
  )
  assert.equal(
    (await db.query('select * from storage.objects where bucket_id=$1', ['lesson-resources'])).rows
      .length,
    0,
  )
  await assert.rejects(db.query('select * from lms_private.lesson_resources'), /permission denied/)
})
test('worksheets persist through draft saves and are restricted to course staff', async () => {
  await as(tutor)
  const body =
    'Investigate the supplied access logs. Identify three suspicious events and explain your response.'
  await db.query(`select public.lms_command('worksheet',$1)`, [
    { lessonId: lid, body, previous: '' },
  ])
  const updatedAt = (await db.query('select updated_at from public.courses where id=$1', [cid]))
    .rows[0].updated_at
  await db.query(`select public.lms_command('saveCourse',$1)`, [{ ...course, updatedAt }])
  const lesson = (await db.query('select public.course_outlines($1::uuid[]) result', [[cid]]))
    .rows[0].result[0].modules[0].lessons[0]
  assert.equal(lesson.worksheet, body)
  assert.equal(
    (await db.query("select public.lesson_resource_command('list',$1) result", [{ lessonId: lid }]))
      .rows[0].result.length,
    1,
  )
  for (const id of [otherTutor, learner]) {
    await as(id)
    await assert.rejects(
      db.query(`select public.lms_command('worksheet',$1)`, [
        { lessonId: lid, body: 'Overwrite', previous: body },
      ]),
      /denied/,
    )
  }
  await as(null, 'anon')
  assert.equal(
    (await db.query('select public.course_outlines($1::uuid[]) result', [[cid]])).rows[0].result[0]
      .modules[0].lessons[0].worksheet,
    '',
  )
  await assert.rejects(db.query('select * from lms_private.lesson_worksheets'), /permission denied/)
})
test('other tutors cannot manage a course', async () => {
  await as(otherTutor)
  await assert.rejects(db.query(`select public.lms_command('saveCourse',$1)`, [course]), /denied/)
})
test('anonymous outline excludes protected lesson content', async () => {
  await as(null, 'anon')
  const { rows } = await db.query(`select public.course_outlines($1::uuid[]) result`, [[cid]])
  assert.equal(rows[0].result[0].modules[0].lessons[0].content, '')
  await assert.rejects(db.query('select * from lms_private.quiz_keys'), /permission denied/)
  await assert.rejects(db.query('select * from public.enrollments'), /permission denied/)
})
test('enrollment is idempotent and requires an active learner', async () => {
  await as(tutor)
  await assert.rejects(db.query('select public.enroll_course($1)', [cid]), /Learner/)
  await as(learner)
  const first = await db.query('select public.enroll_course($1) id', [cid]),
    second = await db.query('select public.enroll_course($1) id', [cid])
  assert.equal(first.rows[0].id, second.rows[0].id)
})
test('unenrolled learners cannot complete lessons or read private content', async () => {
  await as(otherLearner)
  await assert.rejects(db.query('select public.complete_lesson($1)', [lid]), /Enrollment/)
  assert.equal((await db.query('select * from public.lessons')).rows.length, 0)
})

test('enrolled learners read worksheets; staff edits detect conflicts and removal hides them', async () => {
  await as(learner)
  const original = (await db.query('select public.course_outlines($1::uuid[]) result', [[cid]]))
    .rows[0].result[0].modules[0].lessons[0].worksheet
  assert.ok(original.includes('Investigate'))
  await as(otherLearner)
  assert.equal(
    (await db.query('select public.course_outlines($1::uuid[]) result', [[cid]])).rows[0].result[0]
      .modules[0].lessons[0].worksheet,
    '',
  )
  await as(tutor)
  await db.query(`select public.lms_command('worksheet',$1)`, [
    { lessonId: lid, body: 'Updated exercise', previous: original },
  ])
  await assert.rejects(
    db.query(`select public.lms_command('worksheet',$1)`, [
      { lessonId: lid, body: 'Stale overwrite', previous: original },
    ]),
    /another session/,
  )
  await as(admin)
  await db.query(`select public.lms_command('worksheet',$1)`, [
    { lessonId: lid, body: '', previous: 'Updated exercise' },
  ])
  await as(learner)
  assert.equal(
    (await db.query('select public.course_outlines($1::uuid[]) result', [[cid]])).rows[0].result[0]
      .modules[0].lessons[0].worksheet,
    '',
  )
  assert.equal(
    (await db.query('select id from public.enrollments where course_id=$1', [cid])).rows.length,
    1,
  )
})
test('editing enrolled course metadata preserves curriculum and learner history', async () => {
  await as(tutor)
  const token = (await db.query('select updated_at from public.courses where id=$1', [cid])).rows[0]
    .updated_at
  await assert.rejects(
    db.query(`select public.lms_command('saveCourse',$1)`, [
      { ...course, updatedAt: token, modules: [] },
    ]),
    /Curriculum is locked/,
  )
  await db.query(`select public.lms_command('saveCourse',$1)`, [
    { ...course, updatedAt: token, duration: 2 },
  ])
  const saved = (await db.query('select duration from public.courses where id=$1', [cid])).rows[0]
  assert.equal(Number(saved.duration), 2)
  assert.equal(
    (await db.query('select public.course_outlines($1::uuid[]) result', [[cid]])).rows[0].result[0]
      .modules[0].lessons[0].id,
    lid,
  )
  assert.equal(
    (await db.query('select id from public.enrollments where course_id=$1', [cid])).rows.length,
    1,
  )
})
test('enrolled learners can open PDFs; only course staff can remove them', async () => {
  await as(learner)
  const resources = (
    await db.query("select public.lesson_resource_command('list',$1) result", [{ lessonId: lid }])
  ).rows[0].result
  assert.equal(resources.length, 1)
  assert.equal(resources[0].name, 'Lesson reference.pdf')
  const payload = { id: resources[0].id }
  const read = (
    await db.query("select public.lesson_resource_command('read',$1) result", [payload])
  ).rows[0].result
  assert.ok(read.path.startsWith(`${cid}/${lid}/`))
  await assert.rejects(
    db.query("select public.lesson_resource_command('remove',$1)", [payload]),
    /denied/,
  )
  await as(otherLearner)
  await assert.rejects(
    db.query("select public.lesson_resource_command('read',$1)", [payload]),
    /Enrollment/,
  )
  await as(admin)
  await db.query("select public.lesson_resource_command('remove',$1)", [payload])
  await as(learner)
  await assert.rejects(
    db.query("select public.lesson_resource_command('read',$1)", [payload]),
    /unavailable/,
  )
  assert.equal(
    (await db.query("select public.lesson_resource_command('list',$1) result", [{ lessonId: lid }]))
      .rows[0].result.length,
    0,
  )
})
test('quiz thumbnail paths persist, revert to inheritance and reject cross-course or missing files', async () => {
  const imagePath = `${tutor}/${cid}/${randomUUID()}.webp`
  await as(admin, 'postgres')
  await db.query('insert into storage.objects(id,bucket_id,name) values($1,$2,$3)', [
    randomUUID(),
    'course-thumbnails',
    imagePath,
  ])
  const draft = {
    id: randomUUID(),
    courseId: cid,
    title: 'Thumbnail quiz',
    status: 'draft',
    passingScore: 70,
    timeLimit: 10,
    questions: [],
    thumbnailPath: imagePath,
  }
  await as(otherTutor)
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [draft]),
    /management denied/,
  )
  await as(tutor)
  await db.query("select public.lms_command('saveQuiz',$1)", [draft])
  assert.equal(
    (await db.query('select thumbnail_path from public.quizzes where id=$1', [draft.id])).rows[0]
      .thumbnail_path,
    imagePath,
  )
  for (const thumbnailPath of [
    `${tutor}/${randomUUID()}/${randomUUID()}.webp`,
    `${tutor}/${cid}/${randomUUID()}.webp`,
    'https://outside.example/image.webp',
  ]) {
    await assert.rejects(
      db.query("select public.lms_command('saveQuiz',$1)", [
        { ...draft, version: 1, thumbnailPath },
      ]),
      /valid thumbnail/,
    )
  }
  await db.query("select public.lms_command('saveQuiz',$1)", [
    { ...draft, version: 1, thumbnailPath: '' },
  ])
  assert.equal(
    (await db.query('select thumbnail_path from public.quizzes where id=$1', [draft.id])).rows[0]
      .thumbnail_path,
    '',
  )
})

test('quiz drafts preserve unfinished questions, are hidden from learners and do not block certification', async () => {
  await as(tutor)
  const draft = {
    id: randomUUID(),
    courseId: cid,
    title: 'Work in progress',
    passingScore: 70,
    timeLimit: 10,
    status: 'draft',
    questions: [],
  }
  await db.query(`select public.lms_command('saveQuiz',$1)`, [draft])
  const question = {
    id: randomUUID(),
    text: '',
    options: [
      { id: randomUUID(), text: '' },
      { id: randomUUID(), text: '' },
    ],
    correctOptionId: '',
  }
  draft.questions = [question]
  draft.version = 1
  await db.query(`select public.lms_command('saveQuiz',$1)`, [draft])
  assert.equal(
    (await db.query('select text from public.quiz_questions where quiz_id=$1', [draft.id])).rows[0]
      .text,
    '',
  )
  await assert.rejects(
    db.query(`select public.lms_command('saveQuiz',$1)`, [draft]),
    /another session/,
  )
  draft.version = 2
  await assert.rejects(
    db.query(`select public.lms_command('saveQuiz',$1)`, [{ ...draft, status: 'published' }]),
    /Complete every question/,
  )
  await as(learner)
  assert.equal(
    (await db.query('select id from public.quizzes where id=$1', [draft.id])).rows.length,
    0,
  )
  assert.equal(
    (await db.query('select id from public.quiz_questions where quiz_id=$1', [draft.id])).rows
      .length,
    0,
  )
  await assert.rejects(db.query('select public.start_quiz($1)', [draft.id]), /not published/)
  await as(otherTutor)
  await assert.rejects(db.query(`select public.lms_command('saveQuiz',$1)`, [draft]), /denied/)
  await as(tutor)
  question.text = 'Which is correct?'
  question.options[0].text = 'Correct'
  question.options[1].text = 'Incorrect'
  question.correctOptionId = question.options[0].id
  await db.query(`select public.lms_command('saveQuiz',$1)`, [{ ...draft, status: 'published' }])
  await as(learner)
  assert.equal(
    (await db.query('select id from public.quizzes where id=$1', [draft.id])).rows.length,
    1,
  )
  await as(tutor)
  await db.query(`select public.lms_command('saveQuiz',$1)`, [
    { ...draft, version: 3, status: 'draft' },
  ])
})
test('tutor creates quiz with keys inaccessible to learners', async () => {
  await as(tutor)
  await db.query(`select public.lms_command('saveQuiz',$1)`, [
    {
      id: qid,
      courseId: cid,
      title: 'Knowledge check',
      passingScore: 70,
      timeLimit: 10,
      questions: [
        {
          id: questionId,
          text: 'Choose correct',
          options: [
            { id: correctId, text: 'Correct' },
            { id: incorrectId, text: 'Wrong' },
          ],
          correctOptionId: correctId,
          explanation: 'Feedback',
        },
      ],
    },
  ])
  await as(learner)
  await assert.rejects(db.query('select public.quiz_editor_keys($1)', [qid]), /denied/)
  assert.deepEqual(
    (await db.query('select public.quiz_editor_keys_bulk($1::uuid[]) result', [[qid]])).rows[0]
      .result,
    [],
  )
})
let attempt
test('attempt starts on the server and is resumed idempotently', async () => {
  await as(learner)
  attempt = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
  const resumed = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
  assert.equal(resumed.id, attempt.id)
  assert.equal(resumed.deadline, attempt.deadline)
})
test('server grades answers and withholds certificate until lessons complete', async () => {
  await as(learner)
  const { rows } = await db.query('select public.submit_quiz($1,$2) result', [
    attempt.id,
    { [questionId]: correctId },
  ])
  assert.equal(rows[0].result.score, 100)
  assert.equal(rows[0].result.feedback[0].correctOptionId, correctId)
  assert.equal((await db.query('select * from public.certificates')).rows.length, 0)
})
test('lesson completion issues exactly one certificate after a passing quiz', async () => {
  await as(learner)
  await db.query('select public.complete_lesson($1)', [lid])
  await db.query('select public.complete_lesson($1)', [lid])
  assert.equal((await db.query('select * from public.certificates')).rows.length, 1)
  const id = (await db.query('select id from public.certificates')).rows[0].id
  await as(null, 'anon')
  const c = (await db.query('select public.verify_certificate($1) result', [id])).rows[0].result
  assert.equal(c.courseTitle, 'Test course')
  assert.equal(c.email, undefined)
})
test('attempt submission is idempotent and cannot be used by a different learner', async () => {
  await as(learner)
  assert.equal(
    (await db.query('select public.submit_quiz($1,$2) result', [attempt.id, {}])).rows[0].result
      .score,
    100,
  )
  await as(otherLearner)
  await assert.rejects(
    db.query('select public.submit_quiz($1,$2)', [attempt.id, {}]),
    /unavailable/,
  )
})
test('expiration is enforced by database time', async () => {
  await as(learner)
  const next = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
  await db.exec('reset role')
  await db.query(`update public.quiz_attempts set started_at=now()-interval '1 hour' where id=$1`, [
    next.id,
  ])
  await as(learner)
  assert.equal(
    (
      await db.query('select public.submit_quiz($1,$2) result', [
        next.id,
        { [questionId]: correctId },
      ])
    ).rows[0].result.score,
    0,
  )
})
test('notes remain private and disabled users cannot mutate data', async () => {
  await as(learner)
  await db.query(`select public.lms_command('note',$1)`, [{ lessonId: lid, body: 'Private notes' }])
  await as(tutor)
  assert.equal((await db.query('select * from public.lesson_notes')).rows.length, 0)
  await db.exec('reset role')
  await db.query('update public.profiles set is_active=false where id=$1', [learner])
  await as(learner)
  await assert.rejects(db.query('select public.complete_lesson($1)', [lid]), /Enrollment/)
  await assert.rejects(db.query(`select public.lms_command('preferences','{}')`), /Authentication/)
})
test('role reservation activates only after verified email ownership', async () => {
  await db.exec('reset role')
  const uid = randomUUID(),
    email = 'reserved@example.test'
  await db.query(`insert into lms_private.role_reservations(email,role) values($1,'admin')`, [
    email,
  ])
  await db.query(`insert into auth.users(id,email) values($1,$2)`, [uid, email])
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [uid])).rows[0].role,
    'learner',
  )
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [uid])
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [uid])).rows[0].role,
    'admin',
  )
  const verified = randomUUID(),
    verifiedEmail = 'already-verified@example.test'
  await db.query(`insert into lms_private.role_reservations(email,role) values($1,'tutor')`, [
    verifiedEmail,
  ])
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())`, [
    verified,
    verifiedEmail,
  ])
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [verified])).rows[0].role,
    'tutor',
  )
})
test('reports compute database totals within tutor ownership scope', async () => {
  await as(tutor)
  const summary = (await db.query('select public.workspace_summary() result')).rows[0].result
  assert.equal(summary.courses, 1)
  assert.equal(summary.enrollments, 1)
  assert.equal(summary.certificates, 1)
  await as(otherTutor)
  assert.equal(
    (await db.query('select public.workspace_summary() result')).rows[0].result.courses,
    0,
  )
})
test('only administrators can configure platform settings and taxonomy', async () => {
  for (const user of [tutor, otherLearner]) {
    await as(user)
    await assert.rejects(
      db.query(`select public.lms_command('category',$1)`, [{ name: 'Forbidden', role: 'admin' }]),
      /Administrator/,
    )
    await assert.rejects(
      db.query("insert into public.categories values('Forbidden')"),
      /permission denied/,
    )
  }
  await as(admin)
  await db.query(`select public.lms_command('category',$1)`, [{ name: 'Incident Response' }])
  await as(tutor)
  assert.equal(
    (await db.query("select name from public.categories where name='Incident Response'")).rows
      .length,
    1,
  )
  await db.exec('reset role')
  await db.query('update public.profiles set is_active=true where id=$1', [learner])
  await as(admin)
  await db.query(`select public.lms_command('preferences',$1)`, [
    { enrollmentOpen: false, certificateEnabled: false, platformName: 'Test LMS' },
  ])
  await as(otherLearner)
  await assert.rejects(db.query('select public.enroll_course($1)', [cid]), /closed/)
  await db.query(`select public.lms_command('preferences',$1)`, [{ enrollmentOpen: true }])
  await assert.rejects(db.query('select public.enroll_course($1)', [cid]), /closed/)
})
test('expired attempts can restart but attempted quizzes remain immutable', async () => {
  await as(learner)
  const first = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
  await db.exec('reset role')
  await db.query("update public.quiz_attempts set started_at=now()-interval '1 hour' where id=$1", [
    first.id,
  ])
  await as(learner)
  const next = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
  assert.notEqual(first.id, next.id)
  const payload = {
    id: qid,
    courseId: cid,
    title: 'Updated assessment',
    passingScore: 70,
    timeLimit: 10,
    questions: [
      {
        id: questionId,
        text: 'Question',
        options: [
          { id: correctId, text: 'Correct' },
          { id: incorrectId, text: 'Incorrect' },
        ],
        correctOptionId: correctId,
      },
    ],
  }
  await as(tutor)
  await assert.rejects(db.query("select public.lms_command('saveQuiz',$1)", [payload]), /locked/)
  await db.exec('reset role')
  await db.query("update public.quiz_attempts set started_at=now()-interval '1 hour' where id=$1", [
    next.id,
  ])
  await as(tutor)
  await assert.rejects(db.query("select public.lms_command('saveQuiz',$1)", [payload]), /locked/)
  assert.equal(
    (await db.query('select public.quiz_authoring_info($1::uuid[]) result', [[qid]])).rows[0]
      .result[0].editLocked,
    true,
  )
  await as(admin)
  await assert.rejects(db.query("select public.lms_command('saveQuiz',$1)", [payload]), /locked/)
  await as(learner)
  const resumed = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
  assert.notEqual(resumed.id, next.id)
  assert.equal(
    (await db.query('select title from public.quizzes where id=$1', [qid])).rows[0].title,
    'Knowledge check',
  )
})
test('notifications are private and marking one or all read cannot change another user’s feed', async () => {
  const first = randomUUID(),
    second = randomUUID(),
    other = randomUUID()
  await db.exec('reset role')
  for (const [id, owner] of [
    [first, learner],
    [second, learner],
    [other, otherLearner],
  ])
    await db.query(
      'insert into public.notifications(id,user_id,title,message) values($1,$2,$3,$4)',
      [id, owner, 'Test notification', 'Local test only'],
    )
  await as(learner)
  assert.equal(
    (
      await db.query('select id from public.notifications where id=any($1::uuid[])', [
        [first, second, other],
      ])
    ).rows.length,
    2,
  )
  await db.query("select public.lms_command('readNotification',$1)", [{ id: other }])
  await db.query("select public.lms_command('readNotification',$1)", [{ id: first }])
  assert.equal(
    (await db.query('select is_read from public.notifications where id=$1', [first])).rows[0]
      .is_read,
    true,
  )
  assert.equal(
    (await db.query('select is_read from public.notifications where id=$1', [second])).rows[0]
      .is_read,
    false,
  )
  await db.query("select public.lms_command('readNotification',$1)", [{ id: null }])
  assert.equal(
    (await db.query('select id from public.notifications where not is_read')).rows.length,
    0,
  )
  await as(otherLearner)
  assert.equal(
    (await db.query('select is_read from public.notifications where id=$1', [other])).rows[0]
      .is_read,
    false,
  )
  await assert.rejects(
    db.query('insert into public.notifications(user_id,title,message) values($1,$2,$3)', [
      learner,
      'Forged',
      'Denied',
    ]),
    /permission denied/,
  )
})

test('LMS events generate scoped notifications once and scheduled reminders honor preferences', async () => {
  await db.exec('reset role')
  for (const prefix of ['enrollment:', 'result:', 'certificate:']) {
    assert.ok(
      (
        await db.query(
          'select id from public.notifications where user_id=$1 and event_key like $2',
          [learner, `${prefix}%`],
        )
      ).rows.length > 0,
    )
  }
  await db.query(
    "update public.enrollments set completed_at=null,last_accessed_at=now()-interval '8 days' where learner_id=$1 and course_id=$2",
    [learner, cid],
  )
  await db.query(
    'update public.profiles set preferences=preferences || \'{"courseReminders":false}\'::jsonb where id=$1',
    [learner],
  )
  await db.query('select lms_private.scheduled_notifications()')
  assert.equal(
    (
      await db.query(
        "select id from public.notifications where user_id=$1 and category='reminder'",
        [learner],
      )
    ).rows.length,
    0,
  )
  await db.query(
    'update public.profiles set preferences=preferences || \'{"courseReminders":true}\'::jsonb where id=$1',
    [learner],
  )
  await db.query('select lms_private.scheduled_notifications()')
  await db.query('select lms_private.scheduled_notifications()')
  assert.equal(
    (
      await db.query(
        "select id from public.notifications where user_id=$1 and category='reminder'",
        [learner],
      )
    ).rows.length,
    1,
  )
  await as(learner)
  await assert.rejects(
    db.query('select lms_private.scheduled_notifications()'),
    /permission denied/,
  )
  await assert.rejects(db.query('select public.claim_notification_emails()'), /permission denied/)
})

test('notification feed paginates tied timestamps without duplicates and counts all unread records', async () => {
  await db.exec('reset role')
  const stamp = '2099-01-01T00:00:00Z'
  for (let i = 0; i < 60; i++)
    await db.query(
      'insert into public.notifications(user_id,title,message,created_at) values($1,$2,$3,$4)',
      [learner, 'Pagination', 'Local test', stamp],
    )
  await as(learner)
  const first = (await db.query('select public.notification_feed() result')).rows[0].result
  assert.equal(first.notifications.length, 51)
  assert.ok(first.unreadCount >= 60)
  const cursor = first.notifications[49]
  const second = (
    await db.query('select public.notification_feed($1,$2,false) result', [
      cursor.created_at,
      cursor.id,
    ])
  ).rows[0].result
  assert.equal(
    new Set(
      [...first.notifications.slice(0, 50), ...second.notifications]
        .filter((n) => n.title === 'Pagination')
        .map((n) => n.id),
    ).size,
    60,
  )
  assert.ok(second.notifications.every((n) => n.user_id === learner))
})

test('notification email queue leases batches, retries and suppresses opted-out accounts', async () => {
  await db.exec('reset role')
  const first = (await db.query('select public.claim_notification_emails() result')).rows[0].result
  assert.ok(first.length > 0 && first.length <= 50)
  const second = (await db.query('select public.claim_notification_emails() result')).rows[0].result
  assert.ok(second.every((n) => !first.some((x) => x.id === n.id)))
  await db.query('select public.finish_notification_email($1,true)', [first[0].id])
  assert.equal(
    (
      await db.query('select status from lms_private.notification_emails where id=$1', [
        first[0].id,
      ])
    ).rows[0].status,
    'sent',
  )
  await db.query('select public.finish_notification_email($1,false)', [first[1].id])
  assert.equal(
    (
      await db.query('select status from lms_private.notification_emails where id=$1', [
        first[1].id,
      ])
    ).rows[0].status,
    'pending',
  )
  await db.query(
    'update public.profiles set preferences=preferences || \'{"emailUpdates":false,"courseReminders":false,"weeklyDigest":false}\'::jsonb where id=$1',
    [learner],
  )
  const suppressed = (await db.query('select public.claim_notification_emails() result')).rows[0]
    .result
  assert.ok(suppressed.every((n) => n.email !== `${learner}@example.test`))
})

test('direct course RPC calls enforce totals, unique IDs, lengths and safe video protocols', async () => {
  await as(tutor)
  const base = { ...course, id: randomUUID(), status: 'draft' }
  const lesson = {
    id: randomUUID(),
    title: 'Lesson',
    type: 'reading',
    duration: 1,
    content: '',
    videoUrl: '',
  }
  const module = { id: randomUUID(), title: 'Module', lessons: [lesson] }
  for (const [patch, reason] of [
    [{ modules: [module, module] }, /Duplicate module/],
    [{ modules: [{ ...module, lessons: [lesson, lesson] }] }, /Duplicate lesson/],
    [
      { modules: [{ ...module, lessons: [{ ...lesson, videoUrl: 'javascript:alert(1)' }] }] },
      /HTTP or HTTPS/,
    ],
    [{ title: 'X'.repeat(161) }, /too long/],
    [
      {
        modules: Array.from({ length: 6 }, () => ({
          id: randomUUID(),
          title: 'Module',
          lessons: Array.from({ length: 100 }, () => ({ ...lesson, id: randomUUID() })),
        })),
      },
      /500 lessons/,
    ],
  ])
    await assert.rejects(
      db.query("select public.lms_command('saveCourse',$1)", [{ ...base, ...patch }]),
      reason,
    )
  assert.equal(
    (await db.query('select id from public.courses where id=$1', [base.id])).rows.length,
    0,
  )
})

test('upload authorization checks invisible courses and quotas use bounded per-user counters', async () => {
  const hiddenCourse = randomUUID()
  await as(tutor)
  await db.query("select public.lms_command('saveCourse',$1)", [
    { ...course, id: hiddenCourse, status: 'draft', modules: [] },
  ])
  await as(otherTutor)
  assert.equal(
    (await db.query('select id from public.courses where id=$1', [hiddenCourse])).rows.length,
    0,
  )
  await assert.rejects(
    db.query('select public.course_upload_guard($1)', [hiddenCourse]),
    /own course images/,
  )
  await as(learner)
  await assert.rejects(
    db.query('select public.course_upload_guard($1)', [randomUUID()]),
    /management access/,
  )
  await as(tutor)
  const newCourse = randomUUID()
  for (let i = 0; i < 30; i++) await db.query('select public.course_upload_guard($1)', [newCourse])
  await assert.rejects(db.query('select public.course_upload_guard($1)', [newCourse]), /Too many/)
  await db.exec('reset role')
  assert.equal(
    (
      await db.query(
        "select count(*)::integer total from lms_private.course_request_limits where user_id=$1 and operation='thumbnail'",
        [tutor],
      )
    ).rows[0].total,
    1,
  )
  await db.query(
    "update lms_private.course_request_limits set window_start=now()-interval '2 hours' where user_id=$1 and operation='thumbnail'",
    [tutor],
  )
  await as(tutor)
  await db.query('select public.course_upload_guard($1)', [newCourse])
})

test('removing draft lessons prunes their worksheets and queues PDFs without deleting surviving resources', async () => {
  const courseId = randomUUID(),
    moduleId = randomUUID(),
    removedLesson = randomUUID(),
    keptLesson = randomUUID(),
    resourceId = randomUUID()
  const draft = {
    ...course,
    id: courseId,
    status: 'draft',
    modules: [
      {
        id: moduleId,
        title: 'Module',
        lessons: [removedLesson, keptLesson].map((id) => ({
          id,
          title: 'Lesson',
          type: 'reading',
          duration: 1,
          content: '',
          videoUrl: '',
        })),
      },
    ],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveCourse',$1)", [draft])
  await db.query("select public.lms_command('worksheet',$1)", [
    { lessonId: removedLesson, body: 'Practice task', previous: '' },
  ])
  const path = `${courseId}/${removedLesson}/${resourceId}.pdf`
  await db.exec('reset role')
  await db.query('insert into storage.objects(id,bucket_id,name) values($1,$2,$3)', [
    randomUUID(),
    'lesson-resources',
    path,
  ])
  await as(tutor)
  await db.query("select public.lesson_resource_command('add',$1)", [
    { id: resourceId, lessonId: removedLesson, path, name: 'Reference.pdf', bytes: 100, pages: 1 },
  ])
  draft.updatedAt = (
    await db.query('select updated_at from public.courses where id=$1', [courseId])
  ).rows[0].updated_at
  draft.modules[0].lessons = draft.modules[0].lessons.filter((l) => l.id === keptLesson)
  await db.query("select public.lms_command('saveCourse',$1)", [draft])
  await db.exec('reset role')
  assert.equal(
    (await db.query('select id from lms_private.lesson_resources where id=$1', [resourceId])).rows
      .length,
    0,
  )
  assert.equal(
    (
      await db.query('select lesson_id from lms_private.lesson_worksheets where lesson_id=$1', [
        removedLesson,
      ])
    ).rows.length,
    0,
  )
  const claimed = (await db.query('select public.claim_course_resource_cleanup() result')).rows[0]
    .result
  assert.ok(claimed.includes(path))
  await db.query('select public.finish_course_resource_cleanup($1)', [[path]])
  assert.equal(
    (await db.query('select path from lms_private.course_storage_cleanup where path=$1', [path]))
      .rows.length,
    0,
  )
  await as(tutor)
  await assert.rejects(
    db.query('select public.claim_course_resource_cleanup()'),
    /permission denied/,
  )
})

test('large course announcements are queued at save time and fan out in bounded idempotent batches', async () => {
  await db.exec('reset role')
  await db.exec('truncate lms_private.course_announcements')
  const courseId = randomUUID(),
    members = Array.from({ length: 105 }, () => randomUUID())
  await db.query(
    "insert into public.courses(id,tutor_id,title,description,category,level,status) values($1,$2,'Large class','Description','Testing','Beginner','published')",
    [courseId, tutor],
  )
  await db.query(
    "insert into auth.users(id,email) select id,id::text||'@example.test' from unnest($1::uuid[]) id",
    [members],
  )
  await db.query(
    'insert into public.enrollments(learner_id,course_id) select id,$2 from unnest($1::uuid[]) id',
    [members, courseId],
  )
  await db.query(
    "update public.courses set title='Updated large class',updated_at=clock_timestamp() where id=$1",
    [courseId],
  )
  const job = (
    await db.query('select event_key from lms_private.course_announcements where course_id=$1', [
      courseId,
    ])
  ).rows[0].event_key
  const count = async () =>
    (
      await db.query(
        'select count(*)::integer total from public.notifications where event_key=$1',
        [job],
      )
    ).rows[0].total
  assert.equal(await count(), 0)
  assert.equal(
    (await db.query('select lms_private.process_course_announcements() total')).rows[0].total,
    100,
  )
  assert.equal(await count(), 100)
  assert.equal(
    (await db.query('select lms_private.process_course_announcements() total')).rows[0].total,
    5,
  )
  assert.equal(await count(), 105)
  await db.query('select lms_private.process_course_announcements()')
  assert.equal(await count(), 105)
  await as(tutor)
  await assert.rejects(
    db.query('select lms_private.process_course_announcements()'),
    /permission denied/,
  )
})

test('course list overviews exclude protected lesson content even for enrolled learners and course staff', async () => {
  for (const user of [learner, tutor]) {
    await as(user)
    const overviews = (await db.query('select public.course_overviews($1::uuid[]) result', [[cid]]))
      .rows[0].result
    assert.equal(overviews.length, 1)
    const lesson = overviews[0].modules[0].lessons[0]
    assert.equal(lesson.id, lid)
    assert.equal(lesson.content, undefined)
    assert.equal(lesson.videoUrl, undefined)
    assert.equal(lesson.worksheet, undefined)
    const detail = (await db.query('select public.course_outlines($1::uuid[]) result', [[cid]]))
      .rows[0].result
    assert.ok(detail[0].modules[0].lessons[0].content)
  }
})

test('revoked, mismatched or malformed sessions cannot access private LMS data or mutate it', async () => {
  await as(learner)
  assert.ok(
    (await db.query('select id from public.enrollments where learner_id=$1', [learner])).rows
      .length > 0,
  )
  await db.exec('reset role')
  await db.query('delete from auth.sessions where id=$1', [learner])
  await db.exec('set role authenticated')
  assert.equal((await db.query('select id from public.enrollments')).rows.length, 0)
  assert.equal((await db.query('select id from public.notifications')).rows.length, 0)
  await assert.rejects(db.query("select public.lms_command('preferences','{}')"), /Authentication/)
  await as(learner)
  for (const sessionId of [otherLearner, 'invalid-session-id', '']) {
    await db.query("select set_config('request.jwt.claim.session_id',$1,false)", [sessionId])
    assert.equal((await db.query('select id from public.enrollments')).rows.length, 0)
  }
  await as(learner)
  assert.ok((await db.query('select id from public.enrollments')).rows.length > 0)
})

test('quiz authoring rejects malformed options and duplicate identifiers through direct RPC', async () => {
  await as(tutor)
  const q = {
    id: randomUUID(),
    text: 'Question',
    options: [
      { id: randomUUID(), text: 'A' },
      { id: randomUUID(), text: 'B' },
    ],
  }
  q.correctOptionId = q.options[0].id
  const quiz = {
    id: randomUUID(),
    courseId: cid,
    title: 'Validation',
    status: 'draft',
    passingScore: 70,
    timeLimit: 1,
    questions: [q],
  }
  for (const [questions, reason] of [
    [[q, q], /unique IDs/],
    [[{ ...q, options: [q.options[0], q.options[0]] }], /unique IDs/],
    [
      [{ ...q, options: [{ ...q.options[0], text: { nested: 'Invalid' } }, q.options[1]] }],
      /Invalid answer text/,
    ],
    [
      [{ ...q, options: Array.from({ length: 11 }, () => ({ id: randomUUID(), text: 'Option' })) }],
      /2 to 10/,
    ],
  ])
    await assert.rejects(
      db.query("select public.lms_command('saveQuiz',$1)", [{ ...quiz, questions }]),
      reason,
    )
  assert.equal(
    (await db.query('select id from public.quizzes where id=$1', [quiz.id])).rows.length,
    0,
  )
})

test('submissions reject foreign questions and options and replay the originally graded selections', async () => {
  await as(admin)
  await db.query("select public.lms_command('preferences',$1)", [{ enrollmentOpen: true }])
  const validationCourse = {
    ...course,
    id: randomUUID(),
    modules: [
      {
        ...course.modules[0],
        id: randomUUID(),
        lessons: [{ ...course.modules[0].lessons[0], id: randomUUID() }],
      },
    ],
  }
  const q = {
    id: randomUUID(),
    text: 'Validate',
    options: [
      { id: randomUUID(), text: 'A' },
      { id: randomUUID(), text: 'B' },
    ],
  }
  q.correctOptionId = q.options[0].id
  const quiz = {
    id: randomUUID(),
    courseId: validationCourse.id,
    title: 'Submission validation',
    status: 'published',
    passingScore: 70,
    timeLimit: 1,
    questions: [q],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveCourse',$1)", [validationCourse])
  await db.query("select public.lms_command('saveQuiz',$1)", [quiz])
  await as(learner)
  await db.query('select public.enroll_course($1)', [validationCourse.id])
  const a = (await db.query('select public.start_quiz($1) result', [quiz.id])).rows[0].result
  assert.ok(Date.parse(a.serverTime) < Date.parse(a.deadline))
  for (const answers of [
    { [randomUUID()]: q.options[0].id },
    { [q.id]: randomUUID() },
    { [q.id]: { invalid: true } },
  ])
    await assert.rejects(
      db.query('select public.submit_quiz($1,$2)', [a.id, answers]),
      /match this assessment/,
    )
  const result = (
    await db.query('select public.submit_quiz($1,$2) result', [a.id, { [q.id]: q.options[0].id }])
  ).rows[0].result
  const replay = (
    await db.query('select public.submit_quiz($1,$2) result', [a.id, { [q.id]: q.options[1].id }])
  ).rows[0].result
  assert.equal(result.score, 100)
  assert.deepEqual(replay.answers, { [q.id]: q.options[0].id })
  assert.equal(replay.score, 100)
})

test('submission expiry uses wall-clock time after waiting rather than the transaction start time', async () => {
  await as(learner)
  const a = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
  await db.exec('reset role')
  await db.exec('begin')
  try {
    await db.query(
      "update public.quiz_attempts set started_at=clock_timestamp()-interval '10 minutes 5 seconds'+interval '100 milliseconds' where id=$1",
      [a.id],
    )
    await db.query('select pg_sleep(0.15)')
    await db.exec('set role authenticated')
    const result = (
      await db.query('select public.submit_quiz($1,$2) result', [a.id, { [questionId]: correctId }])
    ).rows[0].result
    assert.equal(result.score, 0)
    await db.exec('commit')
  } catch (e) {
    await db.exec('rollback')
    throw e
  }
})

test('new quiz attempts are rate limited while active attempts resume without creating duplicate rows', async () => {
  await db.exec('reset role')
  await db.query(
    "delete from lms_private.course_request_limits where user_id=$1 and operation='quiz-new-attempt'",
    [learner],
  )
  await as(learner)
  for (let i = 0; i < 20; i++) {
    const a = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
    const resumed = (await db.query('select public.start_quiz($1) result', [qid])).rows[0].result
    assert.equal(a.id, resumed.id)
    await db.query('select public.submit_quiz($1,$2)', [a.id, {}])
  }
  await assert.rejects(db.query('select public.start_quiz($1)', [qid]), /Too many/)
})

test('quiz summaries return bounded counts without question bodies and respect draft visibility', async () => {
  await as(tutor)
  const draft = {
    id: randomUUID(),
    courseId: cid,
    title: 'Private draft',
    status: 'draft',
    passingScore: 70,
    timeLimit: 1,
    questions: [],
  }
  await db.query("select public.lms_command('saveQuiz',$1)", [draft])
  const staff = (
    await db.query('select public.quiz_summaries($1::uuid[]) result', [[qid, draft.id]])
  ).rows[0].result
  assert.equal(staff.length, 2)
  assert.equal(staff.find((q) => q.id === qid).questionCount, 1)
  assert.equal(staff.find((q) => q.id === qid).questions, undefined)
  await as(learner)
  const visible = (
    await db.query('select public.quiz_summaries($1::uuid[]) result', [[qid, draft.id]])
  ).rows[0].result
  assert.equal(visible.length, 1)
  assert.equal(visible[0].id, qid)
  assert.equal(visible[0].questionCount, 1)
  assert.equal(visible[0].passed, true)
  assert.equal(visible[0].bestScore, 100)
  assert.deepEqual(
    (await db.query('select public.quiz_summaries($1::uuid[]) result', [Array(201).fill(qid)]))
      .rows[0].result,
    [],
  )
})

test('installed LMS functions use static SQL and privileged functions pin their search path', async () => {
  await db.exec('reset role')
  const functions = (
    await db.query(`select n.nspname, p.proname, p.prosrc, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','lms_private') and p.prokind='f'
    and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`)
  ).rows
  assert.ok(functions.length >= 30)
  for (const fn of functions) {
    const name = `${fn.nspname}.${fn.proname}`
    assert.doesNotMatch(fn.prosrc, /\bexecute\b/i, `${name} must not build SQL from request data`)
    if (fn.prosecdef)
      assert.ok(fn.proconfig?.includes('search_path=""'), `${name} must pin its search path`)
  }
})

test('SQL injection payloads in course and quiz content remain literal values', async () => {
  const attack = "x'); UPDATE public.profiles SET role='admin'; --"
  const draft = {
    ...course,
    id: randomUUID(),
    status: 'draft',
    title: attack,
    description: attack,
    tags: [attack],
    modules: [
      {
        id: randomUUID(),
        title: attack,
        lessons: [
          {
            id: randomUUID(),
            title: attack,
            type: 'reading',
            duration: 1,
            content: attack,
            videoUrl: '',
          },
        ],
      },
    ],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveCourse',$1)", [draft])
  const saved = (
    await db.query('select title,description,tags from public.courses where id=$1', [draft.id])
  ).rows[0]
  assert.equal(saved.title, attack)
  assert.equal(saved.description, attack)
  assert.deepEqual(saved.tags, [attack])
  assert.equal(
    (
      await db.query('select content from public.lessons where id=$1', [
        draft.modules[0].lessons[0].id,
      ])
    ).rows[0].content,
    attack,
  )
  const option = { id: randomUUID(), text: attack }
  const quiz = {
    id: randomUUID(),
    courseId: draft.id,
    title: attack,
    status: 'draft',
    passingScore: 70,
    timeLimit: 10,
    questions: [
      {
        id: randomUUID(),
        text: attack,
        explanation: attack,
        correctOptionId: option.id,
        options: [option, { id: randomUUID(), text: 'Other' }],
      },
    ],
  }
  await db.query("select public.lms_command('saveQuiz',$1)", [quiz])
  const question = (
    await db.query('select text,options from public.quiz_questions where id=$1', [
      quiz.questions[0].id,
    ])
  ).rows[0]
  assert.equal(question.text, attack)
  assert.equal(question.options[0].text, attack)
  await as(learner)
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [learner])).rows[0].role,
    'learner',
  )
})

test('SQL-looking RPC selectors, identifiers and note bodies cannot change permissions or query scope', async () => {
  await as(learner)
  const attack = "'; UPDATE public.profiles SET role='admin'; --"
  await assert.rejects(
    db.query('select public.lms_command($1,$2)', [attack, {}]),
    /Unknown command/,
  )
  await assert.rejects(db.query('select public.enroll_course($1)', [`${cid}' OR '1'='1`]), /uuid/)
  await assert.rejects(
    db.query("select public.lms_command('profile',$1)", [
      { id: attack, name: 'Injected', role: 'admin' },
    ]),
    /uuid/,
  )
  await assert.rejects(
    db.query("select public.lms_command('category',$1)", [{ name: attack }]),
    /Administrator/,
  )
  await db.query("select public.lms_command('note',$1)", [{ lessonId: lid, body: attack }])
  assert.equal(
    (
      await db.query('select body from public.lesson_notes where learner_id=$1 and lesson_id=$2', [
        learner,
        lid,
      ])
    ).rows[0].body,
    attack,
  )
  assert.equal(
    (await db.query('select role from public.profiles where id=$1', [learner])).rows[0].role,
    'learner',
  )
  assert.equal(
    (await db.query('select id from public.courses where title=$1', [attack])).rows.length,
    0,
  )
})

async function learningFixture(requireAssessment = true, quizCount = 0, rules = {}) {
  await as(admin)
  await db.query("select public.lms_command('preferences',$1)", [
    { enrollmentOpen: true, certificateEnabled: true },
  ])
  const c = {
    ...course,
    id: randomUUID(),
    requireAssessment,
    ...rules,
    modules: [
      {
        ...course.modules[0],
        id: randomUUID(),
        lessons: [{ ...course.modules[0].lessons[0], id: randomUUID() }],
      },
    ],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveCourse',$1)", [c])
  const quizzes = []
  for (let i = 0; i < quizCount; i++) {
    const option = { id: randomUUID(), text: 'Correct' }
    const q = {
      id: randomUUID(),
      courseId: c.id,
      title: `Required quiz ${i + 1}`,
      status: 'published',
      passingScore: 70,
      timeLimit: 10,
      questions: [
        {
          id: randomUUID(),
          text: 'Question',
          options: [option, { id: randomUUID(), text: 'Other' }],
          correctOptionId: option.id,
        },
      ],
    }
    await db.query("select public.lms_command('saveQuiz',$1)", [q])
    quizzes.push(q)
  }
  await as(otherLearner)
  const eid = (await db.query('select public.enroll_course($1) id', [c.id])).rows[0].id
  return { c, quizzes, eid, lesson: c.modules[0].lessons[0].id }
}
async function passQuiz(q) {
  await as(otherLearner)
  const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [q.questions[0].id]: q.questions[0].correctOptionId },
  ])
}

test('all required quizzes and lessons qualify in either order and a saved pass never needs a retake', async () => {
  const { c, quizzes, eid, lesson } = await learningFixture(true, 2)
  await passQuiz(quizzes[0])
  await db.query('select public.complete_lesson($1)', [lesson])
  assert.equal(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
    null,
  )
  await assert.rejects(
    db.query('select public.claim_course_certificate($1)', [c.id]),
    /all course requirements/,
  )
  const before = (await db.query('select public.enrollment_summaries($1::uuid[]) result', [[eid]]))
    .rows[0].result[0]
  assert.equal(before.totalAssessments, 2)
  assert.equal(before.passedAssessments, 1)
  assert.equal(before.completedLessons.length, before.totalLessons)
  await passQuiz(quizzes[1])
  assert.ok(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
  )
  const first = (await db.query('select public.claim_course_certificate($1) id', [c.id])).rows[0].id
  assert.equal(
    (await db.query('select public.claim_course_certificate($1) id', [c.id])).rows[0].id,
    first,
  )
  assert.equal(
    (await db.query('select id from public.certificates where course_id=$1', [c.id])).rows.length,
    1,
  )
  await as(tutor)
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [
      {
        ...quizzes[0],
        id: randomUUID(),
        questions: [{ ...quizzes[0].questions[0], id: randomUUID() }],
      },
    ]),
    /issued certificates/,
  )
  await db.query("select public.lms_command('saveQuiz',$1)", [
    { ...quizzes[0], id: randomUUID(), status: 'draft', questions: [] },
  ])
})

test('lesson-only courses issue certificates without quizzes and completion settings lock after enrollment', async () => {
  const { c, eid, lesson } = await learningFixture(false)
  await db.query('select public.complete_lesson($1)', [lesson])
  assert.ok(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
  )
  assert.ok((await db.query('select public.claim_course_certificate($1) id', [c.id])).rows[0].id)
  await as(tutor)
  const timestamp = (
    await db.query('select updated_at::text value from public.courses where id=$1', [c.id])
  ).rows[0].value
  await assert.rejects(
    db.query("select public.lms_command('saveCourse',$1)", [
      { ...c, requireAssessment: true, updatedAt: timestamp },
    ]),
    /requirements are locked/,
  )
  assert.equal(
    (await db.query('select require_assessment from public.courses where id=$1', [c.id])).rows[0]
      .require_assessment,
    false,
  )
})

test('assessment-required courses do not complete or issue certificates while no quiz is published', async () => {
  const { c, eid, lesson } = await learningFixture(true)
  await db.query('select public.complete_lesson($1)', [lesson])
  assert.equal(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
    null,
  )
  await assert.rejects(
    db.query('select public.claim_course_certificate($1)', [c.id]),
    /all course requirements/,
  )
})

test('disabling certificates preserves completion and a learner can claim once enabled without repeating work', async () => {
  const { c, quizzes, eid, lesson } = await learningFixture(true, 1)
  await passQuiz(quizzes[0])
  await as(admin)
  await db.query("select public.lms_command('preferences',$1)", [{ certificateEnabled: false }])
  await as(otherLearner)
  await db.query('select public.complete_lesson($1)', [lesson])
  assert.ok(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
  )
  assert.equal(
    (await db.query('select id from public.certificates where course_id=$1', [c.id])).rows.length,
    0,
  )
  await assert.rejects(db.query('select public.claim_course_certificate($1)', [c.id]), /disabled/)
  await as(tutor)
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [
      { ...quizzes[0], id: randomUUID(), questions: [] },
    ]),
    /issued certificates/,
  )
  await as(admin)
  await db.query("select public.lms_command('preferences',$1)", [{ certificateEnabled: true }])
  await as(learner)
  await assert.rejects(db.query('select public.claim_course_certificate($1)', [c.id]), /Enrollment/)
  await as(otherLearner)
  assert.ok((await db.query('select public.claim_course_certificate($1) id', [c.id])).rows[0].id)
})

test('course browsing paginates 51 matching courses without duplicates and filters beyond the first batch', async () => {
  await db.exec('reset role')
  await db.query(
    `insert into public.courses(id,tutor_id,title,description,category,level,status)
    select gen_random_uuid(),$1,'pagedcatalog '||i,'Lightweight catalog','Testing',case when i=51 then 'Advanced' else 'Beginner' end,'published' from generate_series(1,51) i`,
    [tutor],
  )
  await db.query(
    "insert into public.courses(id,tutor_id,title,description,category,level,status) values(gen_random_uuid(),$1,'pagedcatalog draft','Private','Testing','Beginner','draft')",
    [otherTutor],
  )
  await as(learner)
  const ids = []
  let cursor = null
  do {
    const page = (
      await db.query('select public.browse_courses($1,$2,12,$3) result', [
        'catalog',
        cursor,
        'pagedcatalog',
      ])
    ).rows[0].result
    assert.ok(page.courses.length <= 12)
    for (const card of page.courses) {
      assert.equal(card.modules, undefined)
      assert.equal(card.description, undefined)
      assert.equal(card.status, 'published')
      ids.push(card.id)
    }
    cursor = page.nextCursor
  } while (cursor)
  assert.equal(ids.length, 51)
  assert.equal(new Set(ids).size, 51)
  const advanced = (
    await db.query(
      "select public.browse_courses(search=>'pagedcatalog',level_filter=>'Advanced') result",
    )
  ).rows[0].result
  assert.equal(advanced.courses.length, 1)
  assert.equal(advanced.courses[0].title, 'pagedcatalog 51')
  assert.equal(advanced.nextCursor, null)
  await assert.rejects(db.query("select public.browse_courses(mode=>'managed')"), /access denied/)
  await assert.rejects(db.query('select public.browse_courses(page_size=>null)'), /Invalid/)
  await assert.rejects(db.query('select public.browse_courses(page_size=>10000)'), /Invalid/)
  await as(otherTutor)
  const managed = (
    await db.query("select public.browse_courses(mode=>'managed',search=>'pagedcatalog') result")
  ).rows[0].result
  assert.equal(managed.courses.length, 1)
  assert.equal(managed.courses[0].status, 'draft')
})

test('my courses use enrollment and completion filters in the database without showing someone else’s library', async () => {
  const { c, eid, lesson } = await learningFixture(false)
  await db.query('select public.complete_lesson($1)', [lesson])
  const page = (
    await db.query("select public.browse_courses(mode=>'mine',state_filter=>'completed') result")
  ).rows[0].result
  assert.ok(page.courses.some((x) => x.id === c.id && x.progress === 100 && x.completed))
  await as(learner)
  const other = (await db.query("select public.browse_courses(mode=>'mine') result")).rows[0].result
  assert.equal(
    other.courses.some((x) => x.id === c.id),
    false,
  )
})

test('standalone quizzes require no enrollment, respect creator ownership, grade and issue pass certificates', async () => {
  const option = { id: randomUUID(), text: 'Correct' }
  const q = {
    id: randomUUID(),
    courseId: null,
    title: 'Standalone exam',
    status: 'published',
    passingScore: 70,
    timeLimit: 10,
    certificateRule: 'pass',
    certificateMode: 'automatic',
    questions: [
      {
        id: randomUUID(),
        text: 'Question',
        options: [option, { id: randomUUID(), text: 'Other' }],
        correctOptionId: option.id,
      },
    ],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveQuiz',$1)", [q])
  assert.equal(
    (await db.query('select creator_id from public.quizzes where id=$1', [q.id])).rows[0]
      .creator_id,
    tutor,
  )
  const keys = (await db.query('select public.quiz_editor_keys($1) result', [q.id])).rows[0].result
  assert.equal(keys[0].correctOptionId, option.id)
  await as(otherTutor)
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [{ ...q, version: 1 }]),
    /management denied/,
  )
  await as(otherLearner)
  assert.equal((await db.query('select id from public.quizzes where id=$1', [q.id])).rows.length, 1)
  let a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [a.id, {}])
  await assert.rejects(
    db.query("select public.award_action('claim','quiz',$1)", [q.id]),
    /unavailable/,
  )
  a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [a.id, { [q.questions[0].id]: option.id }])
  const cert = (await db.query("select public.award_action('claim','quiz',$1) result", [q.id]))
    .rows[0].result
  assert.ok(cert.id)
  const saved = (
    await db.query('select course_id,quiz_id from public.certificates where id=$1', [cert.id])
  ).rows[0]
  assert.equal(saved.course_id, null)
  assert.equal(saved.quiz_id, q.id)
  assert.ok(
    (await db.query('select public.verify_certificate($1) result', [cert.id])).rows[0].result,
  )
})

test('submission certificates allow a failing submitted score and manual approval requires authorized creator', async () => {
  const option = { id: randomUUID(), text: 'Correct' }
  const q = {
    id: randomUUID(),
    courseId: null,
    title: 'Participation quiz',
    status: 'published',
    passingScore: 70,
    timeLimit: 10,
    certificateRule: 'submit',
    certificateMode: 'approval',
    questions: [
      {
        id: randomUUID(),
        text: 'Question',
        options: [option, { id: randomUUID(), text: 'Other' }],
        correctOptionId: option.id,
      },
    ],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveQuiz',$1)", [q])
  await as(otherLearner)
  const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [q.questions[0].id]: q.questions[0].options[1].id },
  ])
  await assert.rejects(
    db.query("select public.award_action('claim','quiz',$1)", [q.id]),
    /unavailable/,
  )
  await assert.rejects(
    db.query("select public.award_action('approve','quiz',$1,$2)", [q.id, otherLearner]),
    /Management/,
  )
  await as(otherTutor)
  await assert.rejects(
    db.query("select public.award_action('approve','quiz',$1,$2)", [q.id, otherLearner]),
    /Management/,
  )
  await as(tutor)
  const candidates = (
    await db.query("select public.award_action('candidates','quiz',$1) result", [q.id])
  ).rows[0].result
  assert.equal(candidates.length, 1)
  await assert.rejects(
    db.query("select public.award_action('approve','quiz',$1,$2)", [q.id, learner]),
    /requirements/,
  )
  const cert = (
    await db.query("select public.award_action('approve','quiz',$1,$2) result", [
      q.id,
      otherLearner,
    ])
  ).rows[0].result
  assert.ok(cert.id)
})

test('course quiz-only submission rules and approval work independently of lesson progress', async () => {
  const { c, quizzes, eid } = await learningFixture(true, 1, {
    completionRule: 'quiz_submit',
    certificateMode: 'approval',
  })
  const a = (await db.query('select public.start_quiz($1) result', [quizzes[0].id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [quizzes[0].questions[0].id]: quizzes[0].questions[0].options[1].id },
  ])
  assert.ok(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
  )
  assert.equal(
    (await db.query('select id from public.certificates where course_id=$1', [c.id])).rows.length,
    0,
  )
  await as(tutor)
  const cert = (
    await db.query("select public.award_action('approve','course',$1,$2) result", [
      c.id,
      otherLearner,
    ])
  ).rows[0].result
  assert.ok(cert.id)
})

test('course no-certificate settings preserve completion and block certificate claims', async () => {
  const { c, eid, lesson } = await learningFixture(false, 0, {
    completionRule: 'lessons',
    certificateMode: 'none',
  })
  await db.query('select public.complete_lesson($1)', [lesson])
  assert.ok(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
  )
  await assert.rejects(
    db.query("select public.award_action('claim','course',$1)", [c.id]),
    /unavailable/,
  )
  assert.equal(
    (await db.query('select id from public.certificates where course_id=$1', [c.id])).rows.length,
    0,
  )
})

test('submission-based qualification rejects incomplete and expired attempts and requires lessons when configured', async () => {
  const { c, quizzes, eid, lesson } = await learningFixture(true, 1, {
    completionRule: 'lessons_submit',
    certificateMode: 'automatic',
  })
  const q = quizzes[0]
  let a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [a.id, {}])
  await db.query('select public.complete_lesson($1)', [lesson])
  assert.equal(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
    null,
  )
  a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.exec('reset role')
  await db.query(
    "update public.quiz_attempts set started_at=clock_timestamp()-interval '20 minutes' where id=$1",
    [a.id],
  )
  await as(otherLearner)
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [q.questions[0].id]: q.questions[0].options[1].id },
  ])
  assert.equal(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
    null,
  )
  a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [q.questions[0].id]: q.questions[0].options[1].id },
  ])
  assert.ok(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
  )
  assert.ok(
    (await db.query("select public.award_action('claim','course',$1) result", [c.id])).rows[0]
      .result.id,
  )
})

test('quiz-pass course rules complete without lessons and certificate policy cannot change after enrollment', async () => {
  const { c, quizzes, eid } = await learningFixture(true, 1, {
    completionRule: 'quiz_pass',
    certificateMode: 'automatic',
  })
  await passQuiz(quizzes[0])
  assert.ok(
    (await db.query('select completed_at from public.enrollments where id=$1', [eid])).rows[0]
      .completed_at,
  )
  await as(tutor)
  const timestamp = (
    await db.query('select updated_at::text value from public.courses where id=$1', [c.id])
  ).rows[0].value
  await assert.rejects(
    db.query("select public.lms_command('saveCourse',$1)", [
      { ...c, updatedAt: timestamp, certificateMode: 'none' },
    ]),
    /rules are locked/,
  )
})

test('standalone quiz thumbnails stay in their own scope and draft ownership survives reopening', async () => {
  const q = {
    id: randomUUID(),
    courseId: null,
    title: 'Standalone image',
    status: 'draft',
    passingScore: 70,
    timeLimit: 10,
    questions: [],
  }
  const good = `${tutor}/${q.id}/${randomUUID()}.webp`,
    bad = `${tutor}/${randomUUID()}/${randomUUID()}.webp`
  await db.exec('reset role')
  for (const path of [good, bad])
    await db.query(
      "insert into storage.objects(id,bucket_id,name) values($1,'course-thumbnails',$2)",
      [randomUUID(), path],
    )
  await as(tutor)
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [{ ...q, thumbnailPath: bad }]),
    /valid thumbnail/,
  )
  await db.query("select public.lms_command('saveQuiz',$1)", [{ ...q, thumbnailPath: good }])
  const info = (await db.query('select public.quiz_authoring_info($1::uuid[]) result', [[q.id]]))
    .rows[0].result
  assert.equal(info[0].editLocked, false)
  await as(otherTutor)
  assert.equal((await db.query('select id from public.quizzes where id=$1', [q.id])).rows.length, 0)
  await as(learner)
  assert.equal((await db.query('select id from public.quizzes where id=$1', [q.id])).rows.length, 0)
  await assert.rejects(db.query('select public.start_quiz($1)', [q.id]), /not published/)
})

test('account email changes are blocked without interfering with confirmation and metadata updates', async () => {
  await db.exec('reset role')
  await db.exec(
    "alter table auth.users add column email_change text default ''; alter table auth.users add column encrypted_password text default ''",
  )
  const original = (await db.query('select email from auth.users where id=$1', [learner])).rows[0]
    .email
  await assert.rejects(
    db.query('update auth.users set email=$1 where id=$2', ['different@example.test', learner]),
    /Verify your identity/,
  )
  await assert.rejects(
    db.query('update auth.users set email_change=$1 where id=$2', [
      'different@example.test',
      learner,
    ]),
    /Verify your identity/,
  )
  await db.query(
    "update auth.users set email_confirmed_at=now(),raw_user_meta_data=$1,encrypted_password='test-hash' where id=$2",
    [{ name: 'Updated learner' }, learner],
  )
  const saved = (
    await db.query('select email,email_change,encrypted_password from auth.users where id=$1', [
      learner,
    ])
  ).rows[0]
  assert.equal(saved.email, original)
  assert.equal(saved.email_change, '')
  assert.equal(saved.encrypted_password, 'test-hash')
})

test('verified email changes keep account records, sync profile email and revoke previous sessions', async () => {
  await db.exec('reset role')
  const original = (await db.query('select email from auth.users where id=$1', [learner])).rows[0]
    .email
  const next = 'verified-change@example.test'
  const before = (
    await db.query('select count(*)::int n from public.enrollments where learner_id=$1', [learner])
  ).rows[0].n
  await db.query('select public.authorize_email_change($1,$2)', [learner, next])
  await assert.rejects(
    db.query('update auth.users set email=$1 where id=$2', [next, learner]),
    /Verify your identity/,
  )
  await assert.rejects(
    db.query('update auth.users set email_change=$1 where id=$2', [
      'different@example.test',
      learner,
    ]),
    /Verify your identity/,
  )
  await db.query('update auth.users set email_change=$1 where id=$2', [next, learner])
  assert.equal(
    (await db.query('select email from auth.users where id=$1', [learner])).rows[0].email,
    original,
  )
  await assert.rejects(
    db.query('select public.authorize_email_change($1,$2)', [learner, 'another@example.test']),
    /already pending/,
  )
  await db.query("update auth.users set email=$1,email_change='' where id=$2", [next, learner])
  assert.equal(
    (await db.query('select email from public.profiles where id=$1', [learner])).rows[0].email,
    next,
  )
  assert.equal(
    (
      await db.query('select count(*)::int n from public.enrollments where learner_id=$1', [
        learner,
      ])
    ).rows[0].n,
    before,
  )
  assert.equal(
    (await db.query('select count(*)::int n from auth.sessions where user_id=$1', [learner]))
      .rows[0].n,
    0,
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from lms_private.email_change_permissions where user_id=$1',
        [learner],
      )
    ).rows[0].n,
    0,
  )
})

test('expired email-change permission cannot be used and only service operators may authorize or cancel', async () => {
  await db.exec('reset role')
  await db.exec(
    "alter table auth.users add column email_change_token_current text default ''; alter table auth.users add column email_change_token_new text default ''; alter table auth.users add column email_change_confirm_status integer default 0; alter table auth.users add column email_change_sent_at timestamptz",
  )
  await db.query('select public.authorize_email_change($1,$2)', [learner, 'cancelled@example.test'])
  await db.query(
    "update lms_private.email_change_permissions set expires_at=clock_timestamp()-interval '1 minute' where user_id=$1",
    [learner],
  )
  await assert.rejects(
    db.query('update auth.users set email_change=$1 where id=$2', [
      'cancelled@example.test',
      learner,
    ]),
    /Verify your identity/,
  )
  await db.query('select public.authorize_email_change($1,$2)', [learner, 'cancelled@example.test'])
  await db.query('update auth.users set email_change=$1 where id=$2', [
    'cancelled@example.test',
    learner,
  ])
  await db.query('select public.cancel_email_change($1)', [learner])
  await assert.rejects(
    db.query('update auth.users set email=$1 where id=$2', ['cancelled@example.test', learner]),
    /Verify your identity/,
  )
  await as(learner)
  await assert.rejects(
    db.query('select public.authorize_email_change($1,$2)', [learner, 'unauthorized@example.test']),
    /permission denied/,
  )
  await assert.rejects(
    db.query('select public.cancel_email_change($1)', [learner]),
    /permission denied/,
  )
})

async function purchaseFixture(price = 49.99) {
  await as(admin)
  await db.query("select public.lms_command('preferences',$1)", [{ enrollmentOpen: true }])
  const c = {
    ...course,
    id: randomUUID(),
    price,
    modules: [
      {
        ...course.modules[0],
        id: randomUUID(),
        lessons: [{ ...course.modules[0].lessons[0], id: randomUUID() }],
      },
    ],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveCourse',$1)", [c])
  return c
}
async function quote(c) {
  await as(otherLearner)
  return (await db.query('select public.create_course_order($1) result', [c.id])).rows[0].result
}
async function settle(o, overrides = {}) {
  const p = {
    checkout: `cs_${o.id}`,
    payment: `pi_${o.id}`,
    amount: o.amountMinor,
    currency: o.currency,
    paidAt: new Date().toISOString(),
    ...overrides,
  }
  return db.query('select public.fulfill_course_order($1,$2,$3,$4,$5,$6) id', [
    o.id,
    p.checkout,
    p.payment,
    p.amount,
    p.currency,
    p.paidAt,
  ])
}
test('paid courses reject free enrollment and pending orders never unlock lesson content', async () => {
  const c = await purchaseFixture()
  await as(otherLearner)
  await assert.rejects(db.query('select public.enroll_course($1)', [c.id]), /verified payment/)
  const o = await quote(c)
  assert.equal(o.amountMinor, 4999)
  assert.equal(o.currency, 'usd')
  assert.equal((await quote(c)).id, o.id)
  assert.equal(
    (await db.query('select * from public.lessons where id=$1', [c.modules[0].lessons[0].id])).rows
      .length,
    0,
  )
  await assert.rejects(
    db.query('select public.complete_lesson($1)', [c.modules[0].lessons[0].id]),
    /Enrollment required/,
  )
  await assert.rejects(
    db.query('insert into public.enrollments(learner_id,course_id) values($1,$2)', [
      otherLearner,
      c.id,
    ]),
    /permission denied/,
  )
  await assert.rejects(db.query('select * from lms_private.purchase_orders'), /permission denied/)
  await assert.rejects(
    db.query('select public.bind_course_checkout($1,$2)', [o.id, `cs_${o.id}`]),
    /permission denied/,
  )
  await assert.rejects(settle(o), /permission denied/)
  await as(tutor)
  await assert.rejects(db.query('select public.create_course_order($1)', [c.id]), /Learner access/)
  const free = await purchaseFixture(0)
  await as(otherLearner)
  await assert.rejects(
    db.query('select public.create_course_order($1)', [free.id]),
    /free enrollment/,
  )
  assert.ok((await db.query('select public.enroll_course($1) id', [free.id])).rows[0].id)
})
test('verified payment fulfillment matches the quote and grants access exactly once', async () => {
  const c = await purchaseFixture(),
    o = await quote(c)
  await db.exec('reset role')
  await assert.rejects(settle(o), /does not match/)
  await db.query('select public.bind_course_checkout($1,$2)', [o.id, `cs_${o.id}`])
  await assert.rejects(
    db.query('select public.bind_course_checkout($1,$2)', [o.id, 'replacement']),
    /already bound/,
  )
  for (const bad of [
    { amount: 1 },
    { currency: 'eur' },
    { checkout: 'another_session' },
    { paidAt: '2000-01-01T00:00:00Z' },
  ]) {
    await assert.rejects(settle(o, bad), /does not match|outside checkout validity/)
  }
  const first = (await settle(o)).rows[0].id
  assert.equal((await settle(o)).rows[0].id, first)
  await assert.rejects(settle(o, { payment: 'different_payment' }), /another payment/)
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from public.enrollments where learner_id=$1 and course_id=$2',
        [otherLearner, c.id],
      )
    ).rows[0].n,
    1,
  )
  await as(otherLearner)
  assert.equal(
    (await db.query('select content from public.lessons where id=$1', [c.modules[0].lessons[0].id]))
      .rows[0].content,
    'PRIVATE LESSON CONTENT',
  )
  await assert.rejects(
    db.query('select public.create_course_order($1)', [c.id]),
    /Already enrolled/,
  )
})
test('orders preserve quotes through price changes and prevent payment reuse across courses', async () => {
  const c = await purchaseFixture(),
    o = await quote(c)
  await db.exec('reset role')
  await db.query('select public.bind_course_checkout($1,$2)', [o.id, `cs_${o.id}`])
  await db.query('update public.courses set price=99 where id=$1', [c.id])
  const newer = await quote(c)
  assert.notEqual(newer.id, o.id)
  assert.equal(newer.amountMinor, 9900)
  await db.exec('reset role')
  await settle(o)
  const other = await purchaseFixture(),
    otherOrder = await quote(other)
  await db.exec('reset role')
  await db.query('select public.bind_course_checkout($1,$2)', [
    otherOrder.id,
    `cs_${otherOrder.id}`,
  ])
  await assert.rejects(settle(otherOrder, { payment: `pi_${o.id}` }), /unique constraint/)
  assert.equal(
    (await db.query('select status from lms_private.purchase_orders where id=$1', [otherOrder.id]))
      .rows[0].status,
    'pending',
  )
  assert.equal(
    (await db.query('select id from public.enrollments where course_id=$1', [other.id])).rows
      .length,
    0,
  )
})
test('late webhooks honor timely captures while expired quotes cannot start checkout', async () => {
  const c = await purchaseFixture(),
    o = await quote(c)
  await db.exec('reset role')
  await db.query('select public.bind_course_checkout($1,$2)', [o.id, `cs_${o.id}`])
  await db.query(
    "update lms_private.purchase_orders set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",
    [o.id],
  )
  await assert.rejects(settle(o), /outside checkout validity/)
  assert.ok(
    (await settle(o, { paidAt: new Date(Date.now() - 90 * 60000).toISOString() })).rows[0].id,
  )
  const other = await purchaseFixture(),
    expired = await quote(other)
  await db.exec('reset role')
  await db.query(
    "update lms_private.purchase_orders set created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [expired.id],
  )
  await assert.rejects(
    db.query('select public.bind_course_checkout($1,$2)', [expired.id, 'too_late']),
    /expired/,
  )
})

test('checkout requests are bounded and unpublished or closed courses cannot sell orders', async () => {
  const c = await purchaseFixture()
  await as(learner)
  let id
  for (let i = 0; i < 20; i++) {
    const o = (await db.query('select public.create_course_order($1) result', [c.id])).rows[0]
      .result
    if (id) assert.equal(o.id, id)
    id = o.id
  }
  await assert.rejects(db.query('select public.create_course_order($1)', [c.id]), /Too many/)
  await db.exec('reset role')
  await db.query("update public.courses set status='draft' where id=$1", [c.id])
  await as(otherLearner)
  await assert.rejects(db.query('select public.create_course_order($1)', [c.id]), /unavailable/)
  await as(admin)
  await db.query("select public.lms_command('preferences',$1)", [{ enrollmentOpen: false }])
  await as(otherLearner)
  await assert.rejects(db.query('select public.create_course_order($1)', [c.id]), /closed/)
})

async function pricedQuizFixture(price = 25, settings = {}) {
  await as(admin)
  await db.query("select public.lms_command('preferences',$1)", [
    { enrollmentOpen: true, certificateEnabled: true },
  ])
  const option = { id: randomUUID(), text: 'Correct' }
  const q = {
    id: randomUUID(),
    courseId: '',
    title: 'Paid standalone',
    price,
    status: 'published',
    passingScore: 70,
    timeLimit: 10,
    certificateRule: 'pass',
    certificateMode: 'automatic',
    ...settings,
    questions: [
      {
        id: randomUUID(),
        text: 'Protected question',
        options: [option, { id: randomUUID(), text: 'Other' }],
        correctOptionId: option.id,
      },
    ],
  }
  await as(tutor)
  await db.query("select public.lms_command('saveQuiz',$1)", [q])
  return q
}
test('paid standalone quizzes show metadata but hide questions and reject starts before payment', async () => {
  const q = await pricedQuizFixture()
  await as(otherLearner)
  const info = (await db.query('select public.quiz_summaries($1::uuid[]) result', [[q.id]])).rows[0]
    .result[0]
  assert.equal(info.questionCount, 1)
  assert.equal(info.hasAccess, false)
  assert.equal(
    (await db.query('select price from public.quizzes where id=$1', [q.id])).rows[0].price,
    '25.00',
  )
  assert.equal(
    (await db.query('select * from public.quiz_questions where quiz_id=$1', [q.id])).rows.length,
    0,
  )
  await assert.rejects(
    db.query('select public.start_quiz($1)', [q.id]),
    /Verified payment required/,
  )
  const o = (await db.query('select public.create_quiz_order($1) result', [q.id])).rows[0].result
  assert.equal(o.amountMinor, 2500)
  assert.equal(
    (await db.query('select public.create_quiz_order($1) result', [q.id])).rows[0].result.id,
    o.id,
  )
  await assert.rejects(
    db.query('select public.start_quiz($1)', [q.id]),
    /Verified payment required/,
  )
  await assert.rejects(
    db.query('insert into lms_private.quiz_access(learner_id,quiz_id) values($1,$2)', [
      otherLearner,
      q.id,
    ]),
    /permission denied/,
  )
  await assert.rejects(
    db.query('select public.fulfill_purchase_order($1,$2,$3,$4,$5,$6)', [
      o.id,
      'fake',
      'fake',
      2500,
      'usd',
      new Date().toISOString(),
    ]),
    /permission denied/,
  )
  await as(tutor)
  assert.equal(
    (await db.query('select * from public.quiz_questions where quiz_id=$1', [q.id])).rows.length,
    1,
  )
  await as(otherTutor)
  assert.equal(
    (await db.query('select * from public.quiz_questions where quiz_id=$1', [q.id])).rows.length,
    0,
  )
})
test('one verified standalone purchase unlocks retakes, preserves certificate requirements and locks authoring', async () => {
  const q = await pricedQuizFixture()
  await as(otherLearner)
  const o = (await db.query('select public.create_quiz_order($1) result', [q.id])).rows[0].result
  await db.exec('reset role')
  await db.query('select public.bind_purchase_checkout($1,$2)', [o.id, `cs_${o.id}`])
  const params = [o.id, `cs_${o.id}`, `pi_${o.id}`, o.amountMinor, 'usd', new Date().toISOString()]
  await assert.rejects(
    db.query('select public.fulfill_purchase_order($1,$2,$3,$4,$5,$6)', [
      ...params.slice(0, 3),
      1,
      ...params.slice(4),
    ]),
    /does not match/,
  )
  const access = (
    await db.query('select public.fulfill_purchase_order($1,$2,$3,$4,$5,$6) id', params)
  ).rows[0].id
  assert.equal(
    (await db.query('select public.fulfill_purchase_order($1,$2,$3,$4,$5,$6) id', params)).rows[0]
      .id,
    access,
  )
  assert.equal(
    (await db.query('select * from public.certificates where quiz_id=$1', [q.id])).rows.length,
    0,
  )
  await as(tutor)
  assert.equal(
    (await db.query('select public.quiz_authoring_info($1::uuid[]) result', [[q.id]])).rows[0]
      .result[0].editLocked,
    true,
  )
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [
      { ...q, title: 'Changed after purchase', version: 1 },
    ]),
    /locked/,
  )
  await as(learner)
  await assert.rejects(db.query('select public.start_quiz($1)', [q.id]), /Verified payment/)
  await as(otherLearner)
  assert.equal(
    (await db.query('select public.quiz_summaries($1::uuid[]) result', [[q.id]])).rows[0].result[0]
      .hasAccess,
    true,
  )
  assert.equal(
    (await db.query('select * from public.quiz_questions where quiz_id=$1', [q.id])).rows.length,
    1,
  )
  const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [q.questions[0].id]: q.questions[0].options[1].id },
  ])
  assert.equal(
    (await db.query('select * from public.certificates where quiz_id=$1', [q.id])).rows.length,
    0,
  )
  const again = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  assert.notEqual(again.id, a.id)
  await db.query('select public.submit_quiz($1,$2)', [
    again.id,
    { [q.questions[0].id]: q.questions[0].correctOptionId },
  ])
  assert.equal(
    (await db.query('select * from public.certificates where quiz_id=$1', [q.id])).rows.length,
    1,
  )
})
test('free standalone quizzes stay free and course quizzes cannot acquire a separate price', async () => {
  const free = await pricedQuizFixture(0)
  await as(otherLearner)
  assert.ok((await db.query('select public.start_quiz($1) result', [free.id])).rows[0].result.id)
  await assert.rejects(db.query('select public.create_quiz_order($1)', [free.id]), /free/)
  const c = await purchaseFixture(0)
  await as(tutor)
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [
      { ...free, id: randomUUID(), courseId: c.id, price: 1 },
    ]),
    /separate price/,
  )
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [
      { ...free, id: randomUUID(), price: 0.001 },
    ]),
    /decimal places/,
  )
  const linked = {
    ...free,
    id: randomUUID(),
    courseId: c.id,
    certificateRule: 'none',
    price: 0,
    questions: free.questions.map((q) => ({ ...q, id: randomUUID() })),
  }
  await db.query("select public.lms_command('saveQuiz',$1)", [linked])
  await as(otherLearner)
  await assert.rejects(db.query('select public.start_quiz($1)', [linked.id]), /Enrollment required/)
  await assert.rejects(
    db.query('select public.create_quiz_order($1)', [linked.id]),
    /unavailable|course access/,
  )
  await db.query('select public.enroll_course($1)', [c.id])
  assert.ok((await db.query('select public.start_quiz($1) result', [linked.id])).rows[0].result.id)
})

async function policyLearner() {
  await db.exec('reset role')
  const id = randomUUID()
  await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.test`])
  return id
}

test('practice is unlimited, reveals feedback, and can never award a standalone certificate', async () => {
  const q = await pricedQuizFixture(0, {
    purpose: 'practice',
    maxAttempts: null,
    feedbackPolicy: 'immediate',
    certificateRule: 'none',
    certificateMode: 'none',
  })
  const uid = await policyLearner()
  await as(uid)
  for (let i = 0; i < 4; i++) {
    const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
    assert.equal(a.attemptLimit, null)
    const reply = (
      await db.query('select public.submit_quiz($1,$2) result', [
        a.id,
        { [q.questions[0].id]: q.questions[0].correctOptionId },
      ])
    ).rows[0].result
    assert.equal(reply.feedbackAvailable, true)
    assert.equal(reply.feedback[0].correctOptionId, q.questions[0].correctOptionId)
  }
  assert.equal(
    (await db.query('select id from public.certificates where quiz_id=$1', [q.id])).rows.length,
    0,
  )
  await assert.rejects(
    db.query("select public.award_action('claim','quiz',$1)", [q.id]),
    /unavailable/,
  )
  await as(tutor)
  await assert.rejects(
    db.query("select public.quiz_attempt_action('list',$1)", [q.id]),
    /unlimited/,
  )
  await db.exec('reset role')
  await assert.rejects(
    db.query("update public.quizzes set purpose='assessment' where id=$1", [q.id]),
    /locked/,
  )
  await as(tutor)
  await assert.rejects(
    db.query("select public.lms_command('saveQuiz',$1)", [
      {
        ...q,
        id: randomUUID(),
        certificateRule: 'pass',
        questions: q.questions.map((x) => ({ ...x, id: randomUUID() })),
      },
    ]),
    /practice_quiz_rules/,
  )
})

test('practice never counts toward course completion or assessment totals, and published purpose cannot change after enrollment', async () => {
  const c = await purchaseFixture(0)
  const q = await pricedQuizFixture(0, {
    courseId: c.id,
    purpose: 'practice',
    certificateRule: 'none',
    certificateMode: 'none',
  })
  const uid = await policyLearner()
  await as(uid)
  const enrolled = (await db.query('select public.enroll_course($1) result', [c.id])).rows[0].result
  await db.query('select public.complete_lesson($1)', [c.modules[0].lessons[0].id])
  const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [q.questions[0].id]: q.questions[0].correctOptionId },
  ])
  const e = (
    await db.query('select id,completed_at from public.enrollments where course_id=$1', [c.id])
  ).rows[0]
  assert.equal(e.completed_at, null)
  const summary = (
    await db.query('select public.enrollment_summaries($1::uuid[]) result', [[e.id]])
  ).rows[0].result[0]
  assert.equal(summary.totalAssessments, 0)
  assert.equal(summary.passedAssessments, 0)
  assert.equal(summary.certificateIssued, false)
  await db.exec('reset role')
  await assert.rejects(
    db.query(
      "update public.quizzes set purpose='assessment',certificate_mode='automatic' where id=$1",
      [q.id],
    ),
    /locked/,
  )
})

test('assessment caps count new attempts once, hide raw feedback, allow final-attempt resumption and preserve passing awards on retakes', async () => {
  const q = await pricedQuizFixture(0, { maxAttempts: 2, feedbackPolicy: 'after_pass_or_last' })
  const uid = await policyLearner()
  await as(uid)
  const first = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  const resume = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  assert.equal(first.id, resume.id)
  assert.equal(resume.attemptsUsed, 1)
  const failed = (await db.query('select public.submit_quiz($1,$2) result', [first.id, {}])).rows[0]
    .result
  assert.equal(failed.feedbackAvailable, false)
  assert.deepEqual(failed.feedback, [])
  assert.deepEqual(
    (await db.query('select feedback from public.quiz_attempts where id=$1', [first.id])).rows[0]
      .feedback,
    [],
  )
  assert.deepEqual(
    (await db.query('select public.quiz_result($1) result', [q.id])).rows[0].result.feedback,
    [],
  )
  await assert.rejects(
    db.query('select lms_private.submit_quiz($1,$2)', [first.id, {}]),
    /permission denied/,
  )
  const last = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  assert.equal(last.attemptsRemaining, 0)
  assert.equal(
    (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result.id,
    last.id,
  )
  const passed = (
    await db.query('select public.submit_quiz($1,$2) result', [
      last.id,
      { [q.questions[0].id]: q.questions[0].correctOptionId },
    ])
  ).rows[0].result
  assert.equal(passed.feedbackAvailable, true)
  assert.equal(passed.score, 100)
  await assert.rejects(db.query('select public.start_quiz($1)', [q.id]), /Attempt limit reached/)
  assert.equal(
    (await db.query('select public.quiz_result($1) result', [q.id])).rows[0].result.feedback.length,
    1,
  )
  await assert.rejects(
    db.query("select public.quiz_attempt_action('grant',$1,$2,1,'Extra access')", [q.id, uid]),
    /management denied/,
  )
  await as(otherTutor)
  await assert.rejects(
    db.query("select public.quiz_attempt_action('grant',$1,$2,1,'Extra access')", [q.id, uid]),
    /management denied/,
  )
  await as(tutor)
  await assert.rejects(
    db.query("select public.quiz_attempt_action('grant',$1,$2,1,'x')", [q.id, uid]),
    /reason/,
  )
  const grantId = randomUUID()
  const extra = (
    await db.query(
      "select public.quiz_attempt_action('grant',$1,$2,1,'Network interruption',$3) result",
      [q.id, uid, grantId],
    )
  ).rows[0].result
  assert.equal(extra.attemptsRemaining, 1)
  assert.equal(
    (await db.query("select public.quiz_attempt_action('list',$1) result", [q.id])).rows[0]
      .result[0].id,
    uid,
  )
  assert.deepEqual(
    (
      await db.query("select public.quiz_attempt_action('list',$1,after_id=>$2) result", [
        q.id,
        uid,
      ])
    ).rows[0].result,
    [],
  )
  assert.equal(
    (
      await db.query(
        "select public.quiz_attempt_action('grant',$1,$2,1,'Network interruption',$3) result",
        [q.id, uid, grantId],
      )
    ).rows[0].result.attemptsRemaining,
    1,
  )
  await as(uid)
  assert.equal(
    (await db.query('select public.submit_quiz($1,$2) result', [first.id, {}])).rows[0].result
      .feedbackAvailable,
    true,
  )
  const third = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [third.id, {}])
  assert.equal(
    (await db.query('select id from public.certificates where quiz_id=$1', [q.id])).rows.length,
    1,
  )
  const info = (await db.query('select public.quiz_summaries($1::uuid[]) result', [[q.id]])).rows[0]
    .result[0]
  assert.equal(info.passed, true)
  assert.equal(info.attemptsUsed, 3)
  await as(learner)
  await assert.rejects(db.query('select public.quiz_result($1)', [q.id]), /No completed attempt/)
  await db.exec('reset role')
  assert.equal(
    (await db.query('select reason from lms_private.quiz_attempt_grants where quiz_id=$1', [q.id]))
      .rows[0].reason,
    'Network interruption',
  )
  await assert.rejects(
    db.query('update public.quizzes set max_attempts=99 where id=$1', [q.id]),
    /locked/,
  )
})

test('cooldowns apply to failed and expired attempts, final failures release feedback, and expiry consumes an attempt', async () => {
  const q = await pricedQuizFixture(0, {
    maxAttempts: 2,
    retryDelayMinutes: 60,
    feedbackPolicy: 'after_pass_or_last',
  })
  const uid = await policyLearner()
  await as(uid)
  const first = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [first.id, {}])
  await assert.rejects(db.query('select public.start_quiz($1)', [q.id]), /Please wait/)
  await db.exec('reset role')
  await db.query(
    "update public.quiz_attempts set submitted_at=now()-interval '2 hours' where id=$1",
    [first.id],
  )
  await as(uid)
  const last = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  const failed = (await db.query('select public.submit_quiz($1,$2) result', [last.id, {}])).rows[0]
    .result
  assert.equal(failed.feedbackAvailable, true)
  assert.equal(failed.feedback.length, 1)
  assert.equal(failed.score, 0)
  assert.equal(
    (await db.query('select id from public.certificates where quiz_id=$1', [q.id])).rows.length,
    0,
  )
  const expiring = await pricedQuizFixture(0, {
    maxAttempts: 1,
    feedbackPolicy: 'after_pass_or_last',
  })
  await as(uid)
  const open = (await db.query('select public.start_quiz($1) result', [expiring.id])).rows[0].result
  await db.exec('reset role')
  await db.query(
    "update public.quiz_attempts set started_at=now()-interval '2 hours' where id=$1",
    [open.id],
  )
  await as(uid)
  await assert.rejects(
    db.query('select public.start_quiz($1)', [expiring.id]),
    /Attempt limit reached/,
  )
  const expired = (await db.query('select public.quiz_result($1) result', [expiring.id])).rows[0]
    .result
  assert.equal(expired.score, 0)
  assert.equal(expired.attemptsRemaining, 0)
  assert.equal(expired.feedbackAvailable, true)
})

async function aiFixture() {
  await db.exec('reset role')
  const creator = randomUUID()
  await db.query('insert into auth.users(id,email) values($1,$2)', [
    creator,
    `${creator}@example.test`,
  ])
  await db.query("update public.profiles set role='tutor' where id=$1", [creator])
  await as(creator)
  const id = randomUUID(),
    spec = {
      title: 'Security basics',
      audience: 'New staff',
      goals: 'Recognize risks',
      level: 'Beginner',
      category: 'Testing',
      moduleCount: 1,
      lessonsPerModule: 2,
      tutorId: creator,
    }
  const job = (
    await db.query('select public.ai_course_command($1,$2) result', ['create', { id, spec }])
  ).rows[0].result
  return { creator, id, spec, job }
}
const aiOutline = {
  description: 'A practical introduction.',
  objectives: ['Recognize risks', 'Practice safely'],
  modules: [{ title: 'Foundations', lessons: ['Risk basics', 'Safe practice'] }],
}
async function aiClaim() {
  await db.exec('reset role')
  await db.query("update lms_private.ai_worker_control set last_started='-infinity'")
  return (await db.query('select public.claim_ai_course_work($1) result', ['test-model'])).rows[0]
    .result
}
async function aiFinish(job, result, error = null, permanent = false) {
  await db.exec('reset role')
  await db.query('select public.finish_ai_course_work($1,$2,$3,$4,$5)', [
    job.id,
    job.lease_token,
    result,
    error,
    permanent,
  ])
}
test('AI course jobs are creator-scoped, idempotent and never expose worker leases', async () => {
  await as(learner)
  await assert.rejects(db.query("select public.ai_course_command('list','{}')"), /creator access/)
  const f = await aiFixture()
  assert.equal(f.job.status, 'outline_queued')
  assert.equal('lease_token' in f.job, false)
  assert.equal(
    (
      await db.query("select public.ai_course_command('create',$1) result", [
        { id: f.id, spec: f.spec },
      ])
    ).rows[0].result.id,
    f.id,
  )
  await assert.rejects(
    db.query("select public.ai_course_command('create',$1)", [{ id: randomUUID(), spec: f.spec }]),
    /current AI course/,
  )
  await assert.rejects(
    db.query('select public.claim_ai_course_work($1)', ['test-model']),
    /permission denied/,
  )
  await assert.rejects(db.query('select * from lms_private.ai_course_jobs'), /permission denied/)
  await as(otherTutor)
  assert.equal(
    (await db.query("select public.ai_course_command('list','{}') result")).rows[0].result.some(
      (j) => j.id === f.id,
    ),
    false,
  )
  await assert.rejects(
    db.query("select public.ai_course_command('cancel',$1)", [{ id: f.id }]),
    /unavailable/,
  )
  await as(f.creator)
  await db.query("select public.ai_course_command('cancel',$1)", [{ id: f.id }])
})
test('approved AI outlines create draft courses and generation preserves manual lesson edits', async () => {
  const f = await aiFixture(),
    claimed = await aiClaim()
  assert.equal(claimed.id, f.id)
  assert.equal(
    (await db.query('select public.claim_ai_course_work($1) result', ['other-model'])).rows[0]
      .result,
    null,
  )
  await aiFinish({ ...claimed, lease_token: randomUUID() }, aiOutline)
  assert.equal(
    (await db.query('select status from lms_private.ai_course_jobs where id=$1', [f.id])).rows[0]
      .status,
    'outlining',
  )
  await aiFinish(claimed, aiOutline)
  await as(f.creator)
  const approved = (
    await db.query("select public.ai_course_command('approve',$1) result", [
      { id: f.id, outline: aiOutline },
    ])
  ).rows[0].result
  assert.equal(approved.status, 'generating')
  const courseRow = (
    await db.query('select * from public.courses where id=$1', [approved.courseId])
  ).rows[0]
  assert.equal(courseRow.status, 'draft')
  assert.equal(courseRow.price, '0.00')
  assert.equal(courseRow.certificate_mode, 'none')
  await assert.rejects(
    db.query("select public.ai_course_command('approve',$1)", [{ id: f.id, outline: aiOutline }]),
    /not ready/,
  )
  const first = await aiClaim(),
    item = first.plan[0]
  await db.query('update public.lessons set content=$1 where id=$2', [
    'Human-authored content',
    item.lessonId,
  ])
  await aiFinish(first, { content: '<p>' + 'Generated content. '.repeat(20) + '</p>' })
  assert.equal(
    (await db.query('select content from public.lessons where id=$1', [item.lessonId])).rows[0]
      .content,
    'Human-authored content',
  )
  const second = await aiClaim()
  assert.equal(second.completed, 1)
  await aiFinish(second, {
    content: '<p>' + 'A safe lesson with useful examples. '.repeat(20) + '</p>',
  })
  await aiFinish(second, {
    content: '<p>' + 'Duplicate result must be ignored. '.repeat(20) + '</p>',
  })
  const done = (
    await db.query('select status,completed from lms_private.ai_course_jobs where id=$1', [f.id])
  ).rows[0]
  assert.equal(done.status, 'complete')
  assert.equal(done.completed, 2)
  await as(f.creator)
  const visibleJob = (
    await db.query("select public.ai_course_command('list','{}') result")
  ).rows[0].result.find((j) => j.id === f.id)
  assert.equal(visibleJob.ready, 2)
  const milestones = (
    await db.query(
      'select title,href,event_key from public.notifications where user_id=$1 and event_key like $2',
      [f.creator, `ai-generation:${f.id}:%`],
    )
  ).rows
  assert.equal(milestones.length, 2)
  assert.ok(milestones.some((n) => n.title === 'Your course outline is ready'))
  assert.ok(
    milestones.some(
      (n) =>
        n.title === 'Your course draft is ready' &&
        n.href === `/tutor/courses/${approved.courseId}/edit`,
    ),
  )
  await as(learner)
  assert.equal(
    (await db.query('select * from public.courses where id=$1', [approved.courseId])).rows.length,
    0,
  )
})
test('AI cancellation rejects late results; failed work retries without restarting progress', async () => {
  const f = await aiFixture(),
    claimed = await aiClaim()
  await aiFinish(claimed, null, 'Provider access needs attention.', true)
  await as(f.creator)
  await assert.rejects(
    db.query("select public.ai_course_command('retry',$1)", [{ id: f.id }]),
    /wait a minute/,
  )
  await db.exec('reset role')
  await db.query(
    "update lms_private.ai_course_jobs set updated_at=clock_timestamp()-interval '2 minutes' where id=$1",
    [f.id],
  )
  await as(f.creator)
  await db.query("select public.ai_course_command('retry',$1)", [{ id: f.id }])
  const retried = await aiClaim()
  await as(f.creator)
  await db.query("select public.ai_course_command('cancel',$1)", [{ id: f.id }])
  await aiFinish(retried, aiOutline)
  assert.equal(
    (await db.query('select status,outline from lms_private.ai_course_jobs where id=$1', [f.id]))
      .rows[0].status,
    'cancelled',
  )
})
test('AI creation quotas, lease recovery and the global provider budget are enforced in the database', async () => {
  const f = await aiFixture()
  await db.exec('reset role')
  await db.query(
    'update lms_private.ai_worker_control set request_count=1,request_day=current_date,last_started=$1',
    ['2000-01-01'],
  )
  assert.equal(
    (await db.query('select public.claim_ai_course_work($1,$2) result', ['test-model', 1])).rows[0]
      .result,
    null,
  )
  const first = await aiClaim()
  await db.query(
    "update lms_private.ai_course_jobs set leased_until=clock_timestamp()-interval '1 second' where id=$1",
    [f.id],
  )
  const replacement = await aiClaim()
  assert.notEqual(first.lease_token, replacement.lease_token)
  await aiFinish(first, aiOutline)
  assert.equal(
    (await db.query('select status from lms_private.ai_course_jobs where id=$1', [f.id])).rows[0]
      .status,
    'outlining',
  )
  await aiFinish(replacement, aiOutline)
  await as(f.creator)
  await db.query("select public.ai_course_command('cancel',$1)", [{ id: f.id }])
  for (let i = 0; i < 2; i++) {
    const id = randomUUID()
    await db.query("select public.ai_course_command('create',$1)", [{ id, spec: f.spec }])
    await db.query("select public.ai_course_command('cancel',$1)", [{ id }])
  }
  await assert.rejects(
    db.query("select public.ai_course_command('create',$1)", [{ id: randomUUID(), spec: f.spec }]),
    /Daily limit/,
  )
})

test('Groq migration releases old Gemini leases and retries preserve the new namespaced model', async () => {
  const f = await aiFixture()
  await db.exec('reset role')
  await db.query("update lms_private.ai_worker_control set last_started='-infinity'")
  const legacy = (
    await db.query('select public.claim_ai_course_work($1) result', ['gemini-old-model'])
  ).rows[0].result
  const migration = await readFile(
    new URL('../supabase/migrations/20261015100000_groq_course_generation.sql', import.meta.url),
    'utf8',
  )
  await db.exec(
    migration.slice(migration.indexOf('update lms_private.ai_course_jobs set model=null')),
  )
  await aiFinish(legacy, aiOutline)
  assert.equal(
    (await db.query('select outline from lms_private.ai_course_jobs where id=$1', [f.id])).rows[0]
      .outline,
    null,
  )
  await db.query("update lms_private.ai_worker_control set last_started='-infinity'")
  const groq = (
    await db.query('select public.claim_ai_course_work($1) result', ['openai/gpt-oss-120b'])
  ).rows[0].result
  assert.equal(groq.model, 'openai/gpt-oss-120b')
  assert.equal(groq.id, f.id)
  await aiFinish(groq, aiOutline)
  await as(f.creator)
  await db.query("select public.ai_course_command('approve',$1)", [
    { id: f.id, outline: aiOutline },
  ])
  const next = await aiClaim()
  assert.equal(next.model, 'openai/gpt-oss-120b')
  await as(f.creator)
  await db.query("select public.ai_course_command('cancel',$1)", [{ id: f.id }])
})

test('AI completion warns about empty changed lessons and milestone notifications stay private and deduplicated', async () => {
  const f = await aiFixture(),
    claimed = await aiClaim()
  await aiFinish(claimed, aiOutline)
  await as(f.creator)
  const approved = (
    await db.query("select public.ai_course_command('approve',$1) result", [
      { id: f.id, outline: aiOutline },
    ])
  ).rows[0].result
  const first = await aiClaim()
  await db.query('update public.lessons set title=$1 where id=$2', [
    'Changed by creator',
    first.plan[0].lessonId,
  ])
  const content = { content: '<p>' + 'Useful generated lesson. '.repeat(20) + '</p>' }
  await aiFinish(first, content)
  assert.equal(
    (
      await db.query('select count(*)::int n from public.notifications where event_key=$1', [
        `ai-generation:${f.id}:complete`,
      ])
    ).rows[0].n,
    0,
  )
  const last = await aiClaim()
  await aiFinish(last, content)
  await aiFinish(last, content)
  await as(f.creator)
  const job = (
    await db.query("select public.ai_course_command('list','{}') result")
  ).rows[0].result.find((j) => j.id === f.id)
  assert.equal(job.status, 'complete')
  assert.equal(job.ready, 1)
  const notifications = (
    await db.query('select title,message,href from public.notifications where event_key=$1', [
      `ai-generation:${f.id}:complete`,
    ])
  ).rows
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].title, 'Generation finished — review needed')
  assert.match(notifications[0].message, /1 of 2/)
  assert.equal(notifications[0].href, `/tutor/courses/${approved.courseId}/edit`)
  await as(otherTutor)
  assert.equal(
    (await db.query('select * from public.notifications where user_id=$1', [f.creator])).rows
      .length,
    0,
  )
})

test('repeated AI failures notify once per job without per-retry notification spam', async () => {
  const f = await aiFixture()
  for (let attempt = 0; attempt < 2; attempt++) {
    const claimed = await aiClaim()
    await aiFinish(claimed, null, 'Provider needs attention', true)
    if (attempt === 0) {
      await db.query(
        "update lms_private.ai_course_jobs set updated_at=clock_timestamp()-interval '2 minutes' where id=$1",
        [f.id],
      )
      await as(f.creator)
      await db.query("select public.ai_course_command('retry',$1)", [{ id: f.id }])
    }
  }
  await as(f.creator)
  const notifications = (
    await db.query('select title,href from public.notifications where event_key=$1', [
      `ai-generation:${f.id}:failed`,
    ])
  ).rows
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].title, 'Course generation needs attention')
  assert.equal(notifications[0].href, `/tutor/courses/ai?job=${f.id}`)
  await db.query("select public.ai_course_command('cancel',$1)", [{ id: f.id }])
})

test('learner history is owner-only, bounded and paginated across equal timestamps', async () => {
  const q = await pricedQuizFixture(0)
  const uid = await policyLearner()
  const foreign = await policyLearner()
  await db.exec('reset role')
  const ids = Array.from({ length: 24 }, () => randomUUID())
    .sort()
    .reverse()
  for (const id of ids)
    await db.query(
      `insert into public.quiz_attempts(id,learner_id,quiz_id,version,started_at,submitted_at,score,passed) values($1,$2,$3,1,'2026-01-01','2026-01-01',80,true)`,
      [id, uid, q.id],
    )
  const foreignId = randomUUID()
  await db.query(
    `insert into public.quiz_attempts(id,learner_id,quiz_id,version) values($1,$2,$3,1)`,
    [foreignId, foreign, q.id],
  )
  await as(uid)
  const page = (await db.query('select public.learner_quiz_history($1) result', [q.id])).rows[0]
    .result
  assert.deepEqual(
    page.items.map((x) => x.id),
    ids.slice(0, 21),
  )
  const next = (await db.query('select public.learner_quiz_history($1,$2) result', [q.id, ids[19]]))
    .rows[0].result
  assert.deepEqual(
    next.items.map((x) => x.id),
    ids.slice(20),
  )
  await assert.rejects(
    db.query('select public.learner_quiz_history(null,$1)', [foreignId]),
    /Invalid history cursor/,
  )
  await assert.rejects(
    db.query('select public.learner_quiz_attempt($1)', [foreignId]),
    /Attempt not found/,
  )
  const otherQuiz = await pricedQuizFixture(0)
  await as(uid)
  assert.deepEqual(
    (await db.query('select public.learner_quiz_history($1) result', [otherQuiz.id])).rows[0].result
      .items,
    [],
  )
  await as(tutor)
  await assert.rejects(db.query('select public.learner_quiz_history()'), /Learner access required/)
  await as(null, 'anon')
  await assert.rejects(db.query('select public.learner_quiz_history()'), /permission denied/)
})

test('history preserves delayed feedback and hides active and legacy-version answers', async () => {
  const q = await pricedQuizFixture(0, { maxAttempts: 3, feedbackPolicy: 'after_pass_or_last' })
  const uid = await policyLearner()
  await as(uid)
  const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.query('select public.submit_quiz($1,$2)', [
    a.id,
    { [q.questions[0].id]: q.questions[0].options[1].id },
  ])
  const detail = async (id) =>
    (await db.query('select public.learner_quiz_attempt($1) result', [id])).rows[0].result
  let r = await detail(a.id)
  assert.equal(r.score, 0)
  assert.equal(r.feedbackAvailable, false)
  assert.deepEqual(r.questions, [])
  assert.deepEqual(r.feedback, [])
  const b = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  r = await detail(b.id)
  assert.equal(r.completed, false)
  assert.equal(r.score, null)
  assert.deepEqual(r.answers, {})
  await db.query('select public.submit_quiz($1,$2)', [
    b.id,
    { [q.questions[0].id]: q.questions[0].correctOptionId },
  ])
  r = await detail(a.id)
  assert.equal(r.feedbackAvailable, true)
  assert.equal(r.feedback[0].correctOptionId, q.questions[0].correctOptionId)
  assert.equal(r.questions[0].options.length, 2)
  const active = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  assert.equal((await detail(active.id)).feedbackAvailable, false)
  await db.exec('reset role')
  await db.query('update public.quiz_attempts set version=0 where id=$1', [a.id])
  await as(uid)
  r = await detail(a.id)
  assert.equal(r.score, 0)
  assert.equal(r.feedbackAvailable, false)
  assert.deepEqual(r.questions, [])
  assert.deepEqual(r.feedback, [])
  assert.equal(
    (await db.query('select count(*)::int n from public.quiz_attempts where quiz_id=$1', [q.id]))
      .rows[0].n,
    3,
  )
  assert.equal(
    (await db.query('select count(*)::int n from public.certificates where quiz_id=$1', [q.id]))
      .rows[0].n,
    1,
  )
})

test('expired history remains readable after access is removed, without disclosing answers', async () => {
  const q = await pricedQuizFixture(0)
  const uid = await policyLearner()
  await as(uid)
  const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.exec('reset role')
  await db.query(
    "update public.quiz_attempts set started_at=clock_timestamp()-interval '1 hour' where id=$1",
    [a.id],
  )
  await db.query("update public.quizzes set status='draft' where id=$1", [q.id])
  await as(uid)
  const history = (await db.query('select public.learner_quiz_history($1) result', [q.id])).rows[0]
    .result
  assert.equal(history.items[0].status, 'Expired')
  assert.equal(history.items[0].score, 0)
  assert.equal(history.items[0].canResume, false)
  const detail = (await db.query('select public.learner_quiz_attempt($1) result', [a.id])).rows[0]
    .result
  assert.equal(detail.completed, true)
  assert.equal(detail.status, 'Expired')
  assert.equal(detail.feedbackAvailable, false)
  assert.deepEqual(detail.questions, [])
})

test('history agrees with the server resume grace period and rejects disabled accounts', async () => {
  const q = await pricedQuizFixture(0)
  const uid = await policyLearner()
  await as(uid)
  const a = (await db.query('select public.start_quiz($1) result', [q.id])).rows[0].result
  await db.exec('reset role')
  await db.query(
    "update public.quiz_attempts set started_at=clock_timestamp()-interval '10 minutes 1 second' where id=$1",
    [a.id],
  )
  await as(uid)
  const history = (await db.query('select public.learner_quiz_history($1) result', [q.id])).rows[0]
    .result
  assert.equal(history.items[0].status, 'In progress')
  assert.equal(history.items[0].canResume, true)
  const detail = (await db.query('select public.learner_quiz_attempt($1) result', [a.id])).rows[0]
    .result
  assert.equal(detail.status, 'In progress')
  assert.equal(detail.feedbackAvailable, false)
  await db.exec('reset role')
  await db.query('update public.profiles set is_active=false where id=$1', [uid])
  await as(uid)
  await assert.rejects(db.query('select public.learner_quiz_history()'), /Learner access required/)
  await assert.rejects(
    db.query('select public.learner_quiz_attempt($1)', [a.id]),
    /Learner access required/,
  )
})

after(() => db.close())
