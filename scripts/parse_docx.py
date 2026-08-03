import zipfile
import xml.etree.ElementTree as ET
import os

docx_path = r"c:\LMS\CIRSC\CRISC Exam Practice Questions - CRISC Training - Cyber Purview LLC.docx"

def get_docx_text(path):
    try:
        doc = zipfile.ZipFile(path)
        xml_content = doc.read('word/document.xml')
        root = ET.fromstring(xml_content)
        
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        
        paragraphs = []
        for p in root.findall('.//w:p', ns):
            texts = [t.text for t in p.findall('.//w:t', ns) if t.text]
            if texts:
                paragraphs.append(''.join(texts))
        return paragraphs
    except Exception as e:
        print("Error:", e)
        return []

paragraphs = get_docx_text(docx_path)
print(f"Read {len(paragraphs)} paragraphs.")

# Save to a temporary file for analysis
output_path = r"c:\LMS\CIRSC\temp_extracted.txt"
with open(output_path, "w", encoding="utf-8") as f:
    for idx, p in enumerate(paragraphs):
        f.write(f"{idx}: {p}\n")
print(f"Saved extracted text to {output_path}")
