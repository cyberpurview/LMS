import re
import json

input_path = r"c:\LMS\CIRSC\temp_extracted.txt"
output_path = r"c:\LMS\CIRSC\crisc_questions.json"

with open(input_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

cleaned_lines = []
for line in lines:
    match = re.match(r'^\d+:\s*(.*)', line)
    if match:
        cleaned_lines.append(match.group(1).strip())
    else:
        cleaned_lines.append(line.strip())

questions = []
current_q = {}

i = 0
n = len(cleaned_lines)
while i < n:
    line = cleaned_lines[i]
    if re.match(r'^Question\s+\d+$', line, re.IGNORECASE):
        if current_q and 'text' in current_q:
            questions.append(current_q)
        current_q = {}
        
        # Next line is the question text
        i += 1
        if i < n:
            current_q['text'] = cleaned_lines[i]
            
        # Next line is options
        i += 1
        if i < n:
            options_line = cleaned_lines[i]
            parts = [p.strip() for p in re.split(r'\s*(?=[A-D]\.\s)', options_line) if p.strip()]
            
            def clean_opt(opt_str):
                return re.sub(r'^[A-D]\.\s*', '', opt_str).strip()
                
            current_q['optionA'] = clean_opt(parts[0]) if len(parts) > 0 else ""
            current_q['optionB'] = clean_opt(parts[1]) if len(parts) > 1 else ""
            current_q['optionC'] = clean_opt(parts[2]) if len(parts) > 2 else ""
            current_q['optionD'] = clean_opt(parts[3]) if len(parts) > 3 else ""
            
        # Next line is Correct Answer
        i += 1
        if i < n:
            ans_line = cleaned_lines[i]
            ans_match = re.search(r'Correct\s+Answer:\s*([A-D])', ans_line, re.IGNORECASE)
            if ans_match:
                current_q['correctOption'] = ans_match.group(1).upper()
            else:
                current_q['correctOption'] = ""
                
        # Next line is Explanation
        i += 1
        
    i += 1

if current_q and 'text' in current_q:
    questions.append(current_q)

print(f"Parsed {len(questions)} questions.")

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(questions, f, indent=2)
print(f"Saved to {output_path}")

# Also copy to root for easy user download/reference
root_output_path = r"c:\LMS\cyberpurview_questions.json"
with open(root_output_path, 'w', encoding='utf-8') as f:
    json.dump(questions, f, indent=2)
print(f"Saved copy to {root_output_path}")
