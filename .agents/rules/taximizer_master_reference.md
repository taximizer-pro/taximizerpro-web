# TaximizerPro — Master Reference (DO NOT DELETE)

## App IDs
- **Taximizer** (REAL app with client data): `6a13ae4b43ea85cec629af77`
- **TaximizerPro** (shell, ignore): `6a1650c0a15666c5c924d320`
- **Superagent workspace**: `6a14ef767988d1ef0baff5aa`

## Google Drive Template IDs (MASTER — never change)
| Year | Drive File ID |
|------|--------------|
| 2023 | `12oZacU01PFs-GjmTnBeeARCWB8IKiRb0` |
| 2024 | `1nHkyzHC-jVryNKbHrkeeb355wPDe3fIC` |
| 2025 | `13gBIrUgh-nSZaKZz7yCJ3bDSVT0U8XHz` |

## Drive Folder Structure
- Root: `TaximizerPro V 2.0 Clients`
- Client subfolder: `LastName_FirstName_MM-DD-YYYY_YEARS`
  - e.g. `Bisignano_Eugene_05-27-2026_2023-2024-2025`
- Files inside: `LastName_FirstName_YEAR_1040.pdf`

## PDF Field Maps

### Page 1 — 2023 & 2024
| Widget | Token |
|--------|-------|
| f1_04[0] | FIRST_MIDDLE |
| f1_05[0] | LAST_NAME |
| f1_06[0] | SSN |
| f1_10[0] | ADDRESS |
| f1_12[0] | CITY |
| f1_13[0] | STATE |
| f1_14[0] | ZIP |

### Page 1 — 2025
| Widget | Token |
|--------|-------|
| f1_14[0] | FIRST_MIDDLE |
| f1_15[0] | LAST_NAME |
| f1_16[0] | SSN |
| f1_20[0] | ADDRESS |
| f1_22[0] | CITY |
| f1_23[0] | STATE |
| f1_24[0] | ZIP |

### Page 2 — 2023
| Widget | Token |
|--------|-------|
| f2_25[0] | ROUTING |
| f2_26[0] | ACCOUNT |
| f2_33[0] | OCCUPATION → always "HELPER" |

### Page 2 — 2024
| Widget | Token |
|--------|-------|
| f2_25[0] | ROUTING |
| f2_26[0] | ACCOUNT |
| f2_33[0] | OCCUPATION → always "HELPER" |

### Page 2 — 2025
| Widget | Token |
|--------|-------|
| f2_32[0] | ROUTING |
| f2_33[0] | ACCOUNT |
| f2_40[0] | OCCUPATION → always "HELPER" |

## Sign Here Row (drawn boxes, NOT form widgets)
| Year | Signature Box (x0,y0,x1,y1) | Date Box |
|------|----------------------------|----------|
| 2023 | (91.6, 462.0, 273.6, 492.0) | (273.6, 462.0, 324.0, 492.0) |
| 2024 | (91.6, 462.0, 273.6, 492.0) | (273.6, 462.0, 324.0, 492.0) |
| 2025 | (91.6, 636.0, 273.6, 666.0) | (273.6, 636.0, 324.0, 666.0) |

- Signature box: LEFT — blank until client signs via app
- Date box: MIDDLE — today's date, font=helv, size=7
- Occupation "HELPER": RIGHT — set via widget (see Page 2 maps above)

## Hard Rules (NEVER BREAK)
1. Occupation field ALWAYS = "HELPER" — hardcoded, never from client data
2. SSN = raw digits only, NO dashes (333333333 not 333-33-3333)
3. Apt field: ONLY append if non-empty AND not in: none, null, apt, apt., #, unit
4. Address = street + (apt if valid) — never a separate apt field on the PDF
5. Designee fields (f2_30, f2_31, f2_32 on 2023/2024) = BLANK — never touch
6. Templates have corrupted xref — always repair via fitz save(garbage=4) before filling
7. Root Drive folder ALWAYS = "TaximizerPro V 2.0 Clients"

## Access Roles
- Super Admin: taximizerpro@gmail.com
- Admin: Mike.hennigan44@gmail.com

## Entity: TaxClient (app: 6a13ae4b43ea85cec629af77)
Key fields: first_name, middle_init, last_name, ssn, address, apt, city, state, zip,
            bank_routing, bank_account, email, tax_year (comma-separated e.g. "2023,2024,2025"),
            filing_status (pending → filed), signature_url

## Automation
- Name: "Process New TaxClient Forms"
- ID: 6a16654a41ad75a8fcdc5f2f
- Runs every 5 minutes
- Reads TaxClient where filing_status=pending, generates forms, uploads to Drive, emails client, marks as filed

## Generation Script
- Location: `/app/.agents/skills/fill_1040.py`
- Uses: PyMuPDF (fitz) — pip package pymupdf
- Tokens needed: $GOOGLEDRIVE_ACCESS_TOKEN, $GMAIL_ACCESS_TOKEN (OAuth connectors)

## Known Platform Issue
- Backend function deploy fails with ISOLATE_INTERNAL_FAILURE in this workspace
- Workaround: automation polls every 5 min OR run fill_1040.py skill directly
- Escalation: support@base44.com, ref app ID 6a13ae4b43ea85cec629af77
