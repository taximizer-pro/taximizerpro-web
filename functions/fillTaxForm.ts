import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PDFDocument, rgb } from 'npm:pdf-lib@1.17.1';

// ============================================================
// IRS 1040 PDF Field Mappings — verified from actual AcroForm
// ============================================================

// Standard deductions by filing status and year
const STANDARD_DEDUCTIONS: Record<string, Record<string, number>> = {
  '2023': { single: 13850, mfj: 27700, mfs: 13850, hoh: 20800, qss: 27700 },
  '2024': { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900, qss: 29200 },
  '2025': { single: 15000, mfj: 30000, mfs: 15000, hoh: 22500, qss: 30000 },
};

// Tax brackets for quick calculation
function calcTax(taxableIncome: number, filingStatus: string, year: string): number {
  // 2023/2024 single brackets (simplified)
  const brackets2024Single = [
    [11600, 0.10], [47150, 0.12], [100525, 0.22],
    [191950, 0.24], [243725, 0.32], [609350, 0.35], [Infinity, 0.37]
  ];
  const brackets2024MFJ = [
    [23200, 0.10], [94300, 0.12], [201050, 0.22],
    [383900, 0.24], [487450, 0.32], [731200, 0.35], [Infinity, 0.37]
  ];
  const brackets = (filingStatus === 'mfj' || filingStatus === 'qss') 
    ? brackets2024MFJ : brackets2024Single;
  
  let tax = 0;
  let prev = 0;
  for (const [limit, rate] of brackets) {
    if (taxableIncome <= prev) break;
    const taxable = Math.min(taxableIncome, limit as number) - prev;
    tax += taxable * (rate as number);
    prev = limit as number;
    if (taxableIncome <= limit) break;
  }
  return Math.round(tax);
}

// Format SSN: 123456789 -> 123-45-6789
function formatSSN(ssn: string): string {
  const clean = (ssn || '').replace(/\D/g, '');
  if (clean.length === 9) return `${clean.slice(0,3)}-${clean.slice(3,5)}-${clean.slice(5)}`;
  return ssn || '';
}

// Format currency for display
function fmt(val: number | undefined | null): string {
  if (!val || val === 0) return '';
  return Math.round(val).toString();
}

// ============================================================
// Fill a 1040 PDF using pdf-lib (works with AcroForm fields)
// ============================================================
async function fillForm1040(
  pdfBytes: ArrayBuffer,
  data: Record<string, any>,
  year: string,
  signatureDataUrl?: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  const fs = data.filing_status || 'single';
  const stdDeduction = STANDARD_DEDUCTIONS[year]?.[fs] || STANDARD_DEDUCTIONS['2024'][fs];

  // Compute derived values if not already provided
  const wages = Number(data.w2_wages || 0);
  const interest = Number(data.interest_income || 0);
  const dividends = Number(data.dividend_income || 0);
  const qualDivs = Number(data.qualified_dividends || 0);
  const capGains = Number(data.capital_gains || 0);
  const ssb = Number(data.social_security_benefits || 0);
  const ssTaxable = Math.round(ssb * 0.85);
  const iraDistrib = Number(data.ira_distributions || 0);
  const pension = Number(data.pension_annuity || 0);
  const otherIncome = Number(data.other_income || 0);
  const businessIncome = Number(data.business_income || 0);
  const rentIncome = Number(data.rental_income || 0);

  const totalIncome = wages + interest + dividends + capGains + ssTaxable + 
                      iraDistrib + pension + otherIncome + businessIncome + rentIncome;
  const agi = data.agi ? Number(data.agi) : totalIncome;
  const deduction = data.deduction_type === 'itemized' 
    ? Number(data.itemized_medical || 0) + Number(data.itemized_salt || 0) + 
      Number(data.itemized_mortgage_interest || 0) + Number(data.itemized_charity || 0)
    : stdDeduction;
  const taxableIncome = data.taxable_income ? Number(data.taxable_income) : Math.max(0, agi - deduction);
  const totalTax = data.total_tax ? Number(data.total_tax) : calcTax(taxableIncome, fs, year);
  const withheld = Number(data.w2_federal_withheld || 0);
  const estimatedPayments = Number(data.estimated_tax_payments || 0);
  const totalPayments = data.total_payments ? Number(data.total_payments) : (withheld + estimatedPayments);
  const refundOrOwed = totalPayments - totalTax;

  // Helper to safely set a text field
  const setField = (fieldName: string, value: string) => {
    try {
      const field = form.getTextField(fieldName);
      if (value) field.setText(value);
    } catch (e) { /* field may not exist in this year */ }
  };

  const setCheck = (fieldName: string, checked: boolean) => {
    try {
      const field = form.getCheckBox(fieldName);
      if (checked) field.check(); else field.uncheck();
    } catch (e) {}
  };

  // ============================================================
  // FILL FIELDS — 2023 & 2024 have identical layouts
  // ============================================================
  if (year === '2023' || year === '2024') {
    // === PAGE 1: Personal Info ===
    setField('topmostSubform[0].Page1[0].f1_01[0]', data.first_name || '');
    setField('topmostSubform[0].Page1[0].f1_02[0]', data.last_name || '');
    setField('topmostSubform[0].Page1[0].f1_03[0]', formatSSN(data.ssn));
    
    // Spouse fields (if MFJ)
    if (data.spouse_first_name) {
      setField('topmostSubform[0].Page1[0].f1_07[0]', data.spouse_first_name || '');
      setField('topmostSubform[0].Page1[0].f1_08[0]', data.spouse_last_name || '');
      setField('topmostSubform[0].Page1[0].f1_09[0]', formatSSN(data.spouse_ssn));
    }
    
    // Address
    setField('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_10[0]', data.address || '');
    setField('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_11[0]', data.apt || '');
    setField('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_12[0]', data.city || '');
    setField('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_13[0]', data.state || '');
    setField('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_14[0]', data.zip || '');
    
    // Digital assets — default No
    setCheck('topmostSubform[0].Page1[0].c1_2[0]', true);
    
    // Filing status checkboxes
    setCheck('topmostSubform[0].Page1[0].c1_3[0]', fs === 'single');
    setCheck('topmostSubform[0].Page1[0].c1_3[1]', fs === 'mfj');
    setCheck('topmostSubform[0].Page1[0].c1_3[2]', fs === 'mfs');
    setCheck('topmostSubform[0].Page1[0].c1_3[3]', fs === 'hoh');
    setCheck('topmostSubform[0].Page1[0].c1_3[4]', fs === 'qss');
    
    // === INCOME (Page 1) ===
    setField('topmostSubform[0].Page1[0].f1_40[0]', fmt(wages));          // 1z wages total
    setField('topmostSubform[0].Page1[0].f1_42[0]', fmt(interest));       // 2b taxable interest
    setField('topmostSubform[0].Page1[0].f1_43[0]', fmt(qualDivs));       // 3a qualified divs
    setField('topmostSubform[0].Page1[0].f1_44[0]', fmt(dividends));      // 3b ordinary divs
    setField('topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_46[0]', fmt(iraDistrib));  // 4b IRA taxable
    setField('topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_48[0]', fmt(pension));    // 5b pension taxable
    setField('topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_50[0]', fmt(ssTaxable));  // 6b SS taxable
    setField('topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_51[0]', fmt(capGains));   // 7 capital gains
    setField('topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_53[0]', fmt(agi));        // 9 total income
    setField('topmostSubform[0].Page1[0].Line4a-11_ReadOrder[0].f1_55[0]', fmt(agi));        // 11 AGI
    setField('topmostSubform[0].Page1[0].f1_56[0]', fmt(deduction));      // 12 deduction
    setField('topmostSubform[0].Page1[0].f1_58[0]', fmt(deduction));      // 14 total deductions
    setField('topmostSubform[0].Page1[0].f1_59[0]', fmt(taxableIncome));  // 15 taxable income
    
    // === PAGE 2: Tax, Credits, Payments ===
    setField('topmostSubform[0].Page2[0].f2_02[0]', fmt(totalTax));       // 16 tax
    setField('topmostSubform[0].Page2[0].f2_21[0]', fmt(totalTax));       // 24 total tax
    setField('topmostSubform[0].Page2[0].f2_22[0]', fmt(withheld));       // 25a federal withheld
    setField('topmostSubform[0].Page2[0].f2_23[0]', fmt(totalPayments));  // 33 total payments
    
    // Refund or amount owed
    if (refundOrOwed >= 0) {
      setField('topmostSubform[0].Page2[0].f2_28[0]', fmt(refundOrOwed)); // 35a refund
      // Direct deposit checking
      setCheck('topmostSubform[0].Page2[0].c2_5[0]', true);
      setField('topmostSubform[0].Page2[0].f2_30[0]', data.bank_routing || '');
      setField('topmostSubform[0].Page2[0].f2_31[0]', data.bank_account || '');
    } else {
      setField('topmostSubform[0].Page2[0].f2_32[0]', fmt(Math.abs(refundOrOwed))); // 37 amount owed
    }
    
    // Occupation(s)
    setField('topmostSubform[0].Page2[0].f2_11[0]', data.occupation || '');
    if (data.spouse_first_name) {
      setField('topmostSubform[0].Page2[0].f2_12[0]', data.spouse_occupation || data.occupation || '');
    }
    
    // Signature date
    const today = new Date().toLocaleDateString('en-US');
    setField('topmostSubform[0].Page2[0].f2_39[0]', today);
  }

  // ============================================================
  // 2025 layout (different field positions due to form redesign)
  // ============================================================
  if (year === '2025') {
    // Personal Info
    setField('topmostSubform[0].Page1[0].f1_01[0]', data.first_name || '');
    setField('topmostSubform[0].Page1[0].f1_02[0]', data.last_name || '');
    setField('topmostSubform[0].Page1[0].f1_03[0]', formatSSN(data.ssn));
    
    // Address (2025 moved to different field numbers)
    setField('topmostSubform[0].Page1[0].f1_20[0]', data.address || '');
    setField('topmostSubform[0].Page1[0].f1_21[0]', data.apt || '');
    setField('topmostSubform[0].Page1[0].f1_22[0]', data.city || '');
    setField('topmostSubform[0].Page1[0].f1_23[0]', data.state || '');
    setField('topmostSubform[0].Page1[0].f1_24[0]', data.zip || '');
    
    // Filing status (2025 uses new field names)
    setCheck('topmostSubform[0].Page1[0].c1_1[0]', fs === 'single');
    setCheck('topmostSubform[0].Page1[0].c1_2[0]', fs === 'mfj');
    setCheck('topmostSubform[0].Page1[0].c1_3[0]', fs === 'mfs');
    
    // Digital assets
    setCheck('topmostSubform[0].Page2[0].c2_2[0]', true); // No
    
    // Income (2025 has shifted field numbers)
    // Page 2 has more income lines in 2025
    setField('topmostSubform[0].Page2[0].f2_01[0]', fmt(wages));          // wages
    setField('topmostSubform[0].Page2[0].f2_02[0]', fmt(interest));       // interest
    setField('topmostSubform[0].Page2[0].f2_03[0]', fmt(dividends));      // dividends
    setField('topmostSubform[0].Page2[0].f2_08[0]', fmt(agi));            // total income / AGI
    setField('topmostSubform[0].Page2[0].f2_10[0]', fmt(deduction));      // deduction
    setField('topmostSubform[0].Page2[0].f2_12[0]', fmt(taxableIncome)); // taxable income
    setField('topmostSubform[0].Page2[0].f2_20[0]', fmt(totalTax));       // total tax
    setField('topmostSubform[0].Page2[0].f2_21[0]', fmt(withheld));       // withheld
    setField('topmostSubform[0].Page2[0].f2_30[0]', fmt(totalPayments)); // total payments
    
    if (refundOrOwed >= 0) {
      setField('topmostSubform[0].Page2[0].f2_35[0]', fmt(refundOrOwed)); // refund
      setField('topmostSubform[0].Page2[0].f2_37[0]', data.bank_routing || '');
      setField('topmostSubform[0].Page2[0].f2_38[0]', data.bank_account || '');
    } else {
      setField('topmostSubform[0].Page2[0].f2_41[0]', fmt(Math.abs(refundOrOwed))); // owed
    }
    
    const today = new Date().toLocaleDateString('en-US');
    setField('topmostSubform[0].Page2[0].f2_49[0]', today);
  }

  // ============================================================
  // SIGNATURE — if provided, draw on page 2
  // ============================================================
  if (signatureDataUrl && signatureDataUrl.startsWith('data:image/png;base64,')) {
    try {
      const base64Data = signatureDataUrl.split(',')[1];
      const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const sigImage = await pdfDoc.embedPng(sigBytes);
      
      const pages = pdfDoc.getPages();
      const page2 = pages[1]; // Page 2 (0-indexed)
      const { height } = page2.getSize();
      
      // Signature position varies by year — place in the taxpayer signature box
      // Page 2 bottom area — different coordinates for each year
      let sigX = 70, sigY = 0, sigW = 180, sigH = 35;
      
      if (year === '2023' || year === '2024') {
        // PDF coordinates: bottom-left origin, page height ~792
        // Signature box is near bottom of page 2 — roughly y=570 in PDF coords
        sigX = 70; sigY = height - 610; sigW = 200; sigH = 35;
      } else if (year === '2025') {
        sigX = 70; sigY = height - 720; sigW = 200; sigH = 35;
      }
      
      page2.drawImage(sigImage, {
        x: sigX, y: sigY,
        width: sigW, height: sigH,
        opacity: 1.0
      });
    } catch (sigErr) {
      console.error('Signature embed error:', sigErr);
    }
  }

  // Flatten the form to prevent editing (optional — comment out to keep editable)
  // form.flatten();

  return pdfDoc.save();
}

// ============================================================
// MAIN HANDLER
// ============================================================
Deno.serve(async (req) => {
  try {
    // Allow unauthenticated access for client-facing form submission
    const body = await req.json().catch(() => ({}));
    const { client_id, tax_year, client_data, signature_data } = body;

    if (!tax_year) {
      return Response.json({ error: 'tax_year is required (2023, 2024, or 2025)' }, { status: 400 });
    }

    // PDF template URLs (hosted, always available)
    const PDF_URLS: Record<string, string> = {
      '2023': 'https://base44.app/api/apps/6a14ef767988d1ef0baff5aa/files/mp/public/6a14ef767988d1ef0baff5aa/502ae3b60_f1040_2023.pdf',
      '2024': 'https://base44.app/api/apps/6a14ef767988d1ef0baff5aa/files/mp/public/6a14ef767988d1ef0baff5aa/f8b8eedef_f1040_2024.pdf',
      '2025': 'https://base44.app/api/apps/6a14ef767988d1ef0baff5aa/files/mp/public/6a14ef767988d1ef0baff5aa/f0106f5b1_f1040_2025.pdf',
    };

    const pdfUrl = PDF_URLS[tax_year];
    if (!pdfUrl) {
      return Response.json({ error: `Unsupported tax year: ${tax_year}` }, { status: 400 });
    }

    // Fetch the template PDF
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      return Response.json({ error: 'Failed to fetch PDF template' }, { status: 500 });
    }
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Fill the form
    const filledPdfBytes = await fillForm1040(pdfBuffer, client_data || {}, tax_year, signature_data);

    // Return as PDF binary
    return new Response(filledPdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="1040_${tax_year}_${(client_data?.last_name || 'taxpayer').replace(/\s/g,'_')}.pdf"`,
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    console.error('fillTaxForm error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
