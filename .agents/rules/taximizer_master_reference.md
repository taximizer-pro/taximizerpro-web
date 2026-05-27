# TaximizerPro — Master Reference (DO NOT DELETE)

## App IDs
- **Taximizer** (REAL app with client data): `6a13ae4b43ea85cec629af77`
- **TaximizerPro** (shell, ignore): `6a1650c0a15666c5c924d320`
- **Superagent workspace**: `6a14ef767988d1ef0baff5aa`

## Google Drive Template IDs (UPDATED 2026-05-27 — fresh from IRS.gov)
| Year | Drive File ID |
|------|--------------|
| 2022 | `1iLxjqGceVwVcLtb8w5UW1-FHTQRR8hyy` |
| 2023 | `1JiPyLqgPC0yZg70BuJz9WeW1zauCxdp3` |
| 2024 | `1PO0Mh-Mo8f9M_FVPfxLq2h8AKWw_L4fl` |
| 2025 | `1Q2CIM4rnIjQ4TVAlhpoZc5iUFdamAClM` |

## Drive Folder Structure
- Root: `TaximizerPro V 2.0 Clients`
- Client subfolder: `LastName_FirstName_MM-DD-YYYY_YEARS`
- Files inside: `LastName_FirstName_YEAR_1040.pdf`

## PDF Field Maps (verified 2026-05-27 from actual widget coords)

### 2023 & 2024 — Page 1
| Widget | Field |
|--------|-------|
| f1_04[0] | FIRST_MIDDLE |
| f1_05[0] | LAST_NAME |
| f1_06[0] | SSN |
| f1_10[0] | ADDRESS |
| f1_12[0] | CITY |
| f1_13[0] | STATE |
| f1_14[0] | ZIP |

### 2023 & 2024 — Page 2
| Widget | Field |
|--------|-------|
| f2_33[0] | ROUTING |
| f2_35[0] | ACCOUNT |
| f2_39[0] | OCCUPATION → always "HELPER" |

### 2022 & 2025 — Page 1
| Widget | Field |
|--------|-------|
| f1_04[0] | FIRST_MIDDLE |
| f1_05[0] | LAST_NAME |
| f1_06[0] | SSN |
| f1_11[0] | ADDRESS |
| f1_14[0] | CITY |
| f1_15[0] | STATE |
| f1_16[0] | ZIP |

### 2022 & 2025 — Page 2
| Widget | Field |
|--------|-------|
| f2_32[0] | ROUTING |
| f2_33[0] | ACCOUNT |
| f2_40[0] | OCCUPATION → always "HELPER" |

## Sign Row — Date Stamp (x, y coordinates for insert_text)
| Year | Date XY |
|------|---------|
| 2022 | (250, 651) |
| 2023 | (250, 551) |
| 2024 | (250, 551) |
| 2025 | (250, 651) |

## Hard Rules (NEVER BREAK)
1. Occupation ALWAYS = "HELPER" — hardcoded
2. SSN = raw digits only, NO dashes
3. Apt: ONLY append if non-empty AND not in: none, null, apt, apt., #, unit
4. Designee fields = BLANK always
5. Always repair via fitz save(garbage=4) before filling
6. Signature box = blank until client signs

## Access Roles
- Super Admin: taximizerpro@gmail.com
- Admin: Mike.hennigan44@gmail.com

## Entity: TaxClient (app: 6a13ae4b43ea85cec629af77)
Key fields: first_name, middle_init, last_name, ssn, address, apt, city, state, zip,
            bank_routing, bank_account, email, tax_year, filing_status, signature_url

## Automation
- Name: "Process New TaxClient Forms"
- ID: 6a16654a41ad75a8fcdc5f2f — runs every 5 min

## Generation Script
- Location: `/app/.agents/skills/fill_1040.py`
- Uses: PyMuPDF (fitz)
- Tokens: $GOOGLEDRIVE_ACCESS_TOKEN, $GMAIL_ACCESS_TOKEN
