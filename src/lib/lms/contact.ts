import { z } from 'zod'

export const CONTACT_SUBJECTS = [
  'Account help',
  'Courses and assessments',
  'Certificates',
  'Privacy and data requests',
  'Technical issue',
  'Other',
] as const
export const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[^\r\n\u0000]+$/),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
    subject: z.enum(CONTACT_SUBJECTS),
    message: z
      .string()
      .trim()
      .min(20)
      .max(5000)
      .refine((value) => !value.includes('\u0000')),
    website: z.string().max(200).default(''),
    startedAt: z.number().int().positive(),
    requestId: z.uuid(),
  })
  .strict()
