
import re

def count_tags(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the main form
    form_match = re.search(r'<form[^>]*#serviceForm="ngForm"[^>]*>', content)
    if not form_match:
        print("Main form not found")
        return

    start_pos = form_match.end()
    
    # We want to check the content INSIDE the form until the last closing </form>
    end_form_match = list(re.finditer(r'</form>', content))
    if not end_form_match:
        print("Closing form not found")
        return
    
    # Assuming the last one is ours
    last_form_pos = end_form_match[-1].start()
    
    form_inner_content = content[form_match.start():last_form_pos+7]
    
    div_opens = len(re.findall(r'<div\b', form_inner_content))
    div_closes = len(re.findall(r'</div>', form_inner_content))
    
    print(f"Content length: {len(form_inner_content)}")
    print(f"Starts with: {content[form_match.start():form_match.start()+50]}")
    print(f"Ends with: {content[last_form_pos:last_form_pos+7]}")
    print(f"Div Opens: {div_opens}")
    print(f"Div Closes: {div_closes}")
    print(f"Balance: {div_opens - div_closes}")

    # Check for other forms
    other_forms = re.findall(r'<form\b', form_inner_content)
    print(f"Form tags found: {len(other_forms)}")

count_tags(r"f:\simplifica-antigravity\src\app\features\services\supabase-services\supabase-services.component.html")
