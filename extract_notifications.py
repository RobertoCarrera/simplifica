
import re

def extract_table_sql(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    extracted_lines = []
    
    # Tables to extract
    target_tables = ["notifications", "scheduled_notifications"]

    # Simple extraction logic: find CREATE TABLE ... ;
    
    # 1. Find the CREATE TABLE blocks
    for table in target_tables:
        pattern = r'CREATE TABLE IF NOT EXISTS "public"\."' + table + r'" \((.*?)\);'
        matches = re.finditer(pattern, content, re.DOTALL)
        for match in matches:
            extracted_lines.append(match.group(0))
            extracted_lines.append(";")


    # 2. Find ALTER TABLE ... ADD CONSTRAINT blocks
    for table in target_tables:
        pattern = r'ALTER TABLE ONLY "public"\."' + table + r'"\s+ADD CONSTRAINT .*?;'
        matches = re.finditer(pattern, content, re.DOTALL)
        for match in matches:
            extracted_lines.append(match.group(0))
            
    # 3. Find CREATE INDEX blocks
    for table in target_tables:
        # Improved regex for indexes, potentially multi-line
        pattern = r'CREATE (UNIQUE )?INDEX .*? ON "public"\."' + table + r'" .*?;'
        matches = re.finditer(pattern, content, re.DOTALL)
        for match in matches:
             extracted_lines.append(match.group(0))

    # 4. Find CREATE TRIGGER blocks (risky if function missing, but let's try)
    for table in target_tables:
        pattern = r'CREATE TRIGGER .*? ON "public"\."' + table + r'" .*?;'
        matches = re.finditer(pattern, content, re.DOTALL)
        for match in matches:
            extracted_lines.append(match.group(0))
            

    return "\n\n".join(extracted_lines)

if __name__ == "__main__":
    sql = extract_table_sql("remote_schema.sql")
    print(sql)
