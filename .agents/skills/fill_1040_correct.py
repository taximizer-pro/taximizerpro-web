#!/usr/bin/env python3
"""
TaximizerPro 1040 Form Filler v11
Verified field maps for 2023, 2024, 2025 IRS forms
"""
import fitz, os, re, sys, json, urllib.request

def dl_file(fid, token):
    """Download a file from Google Drive"""
    req = urllib.request.Request(
        f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media",
        headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def fill_1040(client_data, tax_year, output_path):
    """
    Fill 1040 form for given client and tax year
    """
    
    # Master template IDs
    masters = {
        "2023": "11EliCV6RXer1bA_eqnFLB5esDZsJefiu",
        "2024": "1jeO8jBbrjHg7IkTfQyv7eJiTPuP-3d_W",
        "2025": "1YrqK6Y3p-QgxzlIi0b7ph3XNAfmDX6mc",
    }
    
    # Verified field maps
    maps_2023_2024 = {
        "p1": [
            ("f1_04[0]", "first_middle"),
            ("f1_05[0]", "last_name"),
            ("f1_06[0]", "ssn"),
            ("f1_10[0]", "address"),
            ("f1_12[0]", "city"),
            ("f1_13[0]", "state"),
            ("f1_14[0]", "zip"),
            ("c1_3[0]", "single"),  # checkbox
        ],
        "p2": [
            ("f2_25[0]", "routing"),
            ("c2_5[0]", "checking"),  # checkbox
            ("f2_26[0]", "account"),
            ("f2_34[0]", "sign_date"),
        ]
    }
    
    maps_2025 = {
        "p1": [
            ("f1_04[0]", "first_middle"),
            ("f1_05[0]", "last_name"),
            ("f1_06[0]", "ssn"),
            ("f1_11[0]", "address"),  # Note: different field
            ("f1_14[0]", "city"),
            ("f1_15[0]", "state"),
            ("f1_16[0]", "zip"),
        ],
        "p2": [
            ("f2_32[0]", "routing"),
            ("c2_16[0]", "checking"),  # checkbox
            ("f2_33[0]", "account"),
            ("f2_41[0]", "sign_date"),
        ]
    }
    
    # Normalize data
    ssn_clean = re.sub(r'\D', '', client_data.get('ssn', ''))
    first_mi = f"{client_data.get('first_name', '').upper()} {client_data.get('middle_init', '').upper()}".strip()
    last = client_data.get('last_name', '').upper()
    address = client_data.get('address', '').upper()
    apt = client_data.get('apt', '')
    if apt and apt.lower() not in ['none', 'null', 'apt', 'apt.', '#', 'unit', '']:
        address = f"{address} APT {apt.upper()}"
    
    city = client_data.get('city', '').upper()
    state = client_data.get('state', '').upper()
    zip_code = client_data.get('zip', '')
    routing = client_data.get('bank_routing', '')
    account = client_data.get('bank_account', '')
    sign_date = client_data.get('sign_date', '')
    
    # Get template
    gdrive_token = os.environ.get('GOOGLEDRIVE_ACCESS_TOKEN')
    if not gdrive_token:
        raise ValueError("GOOGLEDRIVE_ACCESS_TOKEN not set")
    
    master_id = masters.get(tax_year)
    if not master_id:
        raise ValueError(f"Unknown tax year: {tax_year}")
    
    print(f"Downloading {tax_year} template from Drive...")
    pdf_bytes = dl_file(master_id, gdrive_token)
    
    # Open in memory
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    
    # Repair and save to temp file
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name
    doc.save(tmp_path, garbage=4)
    doc.close()
    
    # Reopen and fill
    doc = fitz.open(tmp_path)
    
    # Select maps
    if tax_year in ["2023", "2024"]:
        maps = maps_2023_2024
    else:
        maps = maps_2025
    
    # Fill page 1
    p1_fields = doc[0].widgets()
    p1_dict = {w.field_name: w for w in p1_fields}
    
    for field_name, data_key in maps["p1"]:
        if field_name not in p1_dict:
            print(f"  Warning: Field {field_name} not found on P1")
            continue
        
        widget = p1_dict[field_name]
        val = None
        
        if data_key == "first_middle":
            val = first_mi
        elif data_key == "last_name":
            val = last
        elif data_key == "ssn":
            val = ssn_clean
        elif data_key == "address":
            val = address
        elif data_key == "city":
            val = city
        elif data_key == "state":
            val = state
        elif data_key == "zip":
            val = zip_code
        elif data_key == "single":
            widget.field_value = True
            val = "skip"
        
        if val and val != "skip":
            widget.field_value = val
    
    # Fill page 2
    p2_fields = doc[1].widgets()
    p2_dict = {w.field_name: w for w in p2_fields}
    
    for field_name, data_key in maps["p2"]:
        if field_name not in p2_dict:
            print(f"  Warning: Field {field_name} not found on P2")
            continue
        
        widget = p2_dict[field_name]
        val = None
        
        if data_key == "routing":
            val = routing
        elif data_key == "checking":
            widget.field_value = True
            val = "skip"
        elif data_key == "account":
            val = account
        elif data_key == "sign_date":
            val = sign_date
        
        if val and val != "skip":
            widget.field_value = val
    
    # Insert occupation as text overlay
    p2 = doc[1]
    occupation = "HELPER"
    if tax_year in ["2023", "2024"]:
        p2.insert_text((105, 544), occupation, fontsize=10, color=(0, 0, 0))
    else:
        p2.insert_text((105, 718), occupation, fontsize=10, color=(0, 0, 0))
    
    # Save to final output
    doc.save(output_path, garbage=4)
    doc.close()
    
    # Clean up temp
    os.unlink(tmp_path)
    
    print(f"  ✓ {tax_year}: {os.path.getsize(output_path):,} bytes")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <client_json> <tax_year> <output_pdf>")
        sys.exit(1)
    
    client_data = json.loads(sys.argv[1])
    tax_year = sys.argv[2]
    output_path = sys.argv[3]
    
    fill_1040(client_data, tax_year, output_path)
