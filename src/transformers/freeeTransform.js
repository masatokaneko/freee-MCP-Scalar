/**
 * Transform freee journal data based on detail level
 * @param {Object} rawResponse - Raw response from freee API
 * @param {string} detail - Detail level ('simple', 'standard', 'full')
 * @returns {Array} Transformed journal entries
 */
export function transformFreeeJournals(rawResponse, detail = 'standard') {
  if (!rawResponse) {
    return [];
  }

  const journals = rawResponse.journals || [];
  
  switch (detail) {
    case 'simple':
      return transformSimple(journals);
    case 'standard':
      return transformStandard(journals);
    case 'full':
      return transformFull(journals);
    default:
      return transformStandard(journals);
  }
}

/**
 * Simple transformation - minimal fields for quick overview
 */
function transformSimple(journals) {
  return journals.map((entry) => ({
    source: 'freee',
    entryId: entry.id,
    date: entry.issue_date || entry.transaction_date,
    debitAccount: entry.debit_items?.[0]?.account_item?.name,
    creditAccount: entry.credit_items?.[0]?.account_item?.name,
    amount: entry.total_amount || entry.amount,
    memo: entry.description
  }));
}

/**
 * Standard transformation - commonly used fields
 */
function transformStandard(journals) {
  return journals.map((entry) => {
    const debitItems = entry.debit_items || [];
    const creditItems = entry.credit_items || [];
    
    return {
      // Common fields
      source: 'freee',
      slip_id: entry.id,
      slip_number: entry.number,
      transaction_date: entry.issue_date || entry.transaction_date,
      management_number: entry.adjustment || null,
      content: entry.description,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      
      // Debit items
      debit_items: debitItems.map(item => ({
        account_item: item.account_item?.name,
        account_item_code: item.account_item?.code,
        amount: item.amount,
        tax_code: item.tax_code,
        tax_amount: item.tax?.amount,
        partner_name: item.partner?.name,
        partner_code: item.partner?.code,
        item_name: item.item?.name,
        section_name: item.section?.name,
        memo: item.description
      })),
      
      // Credit items  
      credit_items: creditItems.map(item => ({
        account_item: item.account_item?.name,
        account_item_code: item.account_item?.code,
        amount: item.amount,
        tax_code: item.tax_code,
        tax_amount: item.tax?.amount,
        partner_name: item.partner?.name,
        partner_code: item.partner?.code,
        item_name: item.item?.name,
        section_name: item.section?.name,
        memo: item.description
      })),
      
      // Summary
      total_amount: entry.total_amount || entry.amount,
      entry_line_count: debitItems.length + creditItems.length
    };
  });
}

/**
 * Full transformation - all available fields
 */
function transformFull(journals) {
  let lineNo = 1;
  const result = [];
  
  journals.forEach((entry) => {
    const debitItems = entry.debit_items || [];
    const creditItems = entry.credit_items || [];
    const commonData = {
      // Common fields
      no: null, // Will be set per line
      transaction_date: entry.issue_date || entry.transaction_date,
      management_number: entry.adjustment || null,
      slip_id: entry.id,
      slip_number: entry.number,
      record_number: entry.ref_number || null,
      entry_line_no: null, // Will be set per line
      entry_line_count: debitItems.length + creditItems.length,
      content: entry.description,
      source: entry.type || 'manual',
      register_method: entry.entry_method || null,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      created_by: entry.user?.display_name || null,
      finalized_flag: entry.posting_status === 'posted',
      
      // Workflow fields
      approval_status: entry.approval_status || null,
      applicant: entry.applicant?.display_name || null,
      applicant_date: entry.application_date || null,
      approver: entry.approver?.display_name || null,
      approval_date: entry.approval_date || null,
      transaction_id: entry.deal_id || null,
      transfer_id: entry.transfer_id || null,
      journal_voucher_id: entry.manual_journal_id || null,
      expense_application_id: entry.expense_application_id || null,
      payment_request_id: entry.payment_request_id || null
    };
    
    // Process debit items
    debitItems.forEach((item, index) => {
      const line = {
        ...commonData,
        no: lineNo++,
        entry_line_no: index + 1,
        
        // Debit fields
        debit_account_item: item.account_item?.name,
        debit_account_item_code: item.account_item?.code,
        debit_account_item_display_name: item.account_item?.account_category,
        debit_shortcut1: item.account_item?.shortcut1,
        debit_shortcut2: item.account_item?.shortcut2,
        debit_amount: item.amount,
        debit_tax_code: item.tax_code,
        debit_tax_amount: item.tax?.amount || 0,
        debit_tax_type: item.tax?.type,
        debit_tax_rate: item.tax?.rate,
        debit_reduced_tax_flag: item.tax?.reduced || false,
        debit_partner_code: item.partner?.code,
        debit_partner_name: item.partner?.name,
        debit_partner_shortcut1: item.partner?.shortcut1,
        debit_partner_shortcut2: item.partner?.shortcut2,
        debit_item_name: item.item?.name,
        debit_item_shortcut1: item.item?.shortcut1,
        debit_item_shortcut2: item.item?.shortcut2,
        debit_section_name: item.section?.name,
        debit_section_shortcut1: item.section?.shortcut1,
        debit_section_shortcut2: item.section?.shortcut2,
        debit_memo: item.description,
        debit_memo_shortcut1: item.tag_ids?.[0],
        debit_memo_shortcut2: item.tag_ids?.[1],
        debit_segment1: item.segment_1?.name,
        debit_segment1_shortcut1: item.segment_1?.shortcut1,
        debit_segment1_shortcut2: item.segment_1?.shortcut2,
        debit_segment2: item.segment_2?.name,
        debit_segment2_shortcut1: item.segment_2?.shortcut1,
        debit_segment2_shortcut2: item.segment_2?.shortcut2,
        debit_segment3: item.segment_3?.name,
        debit_segment3_shortcut1: item.segment_3?.shortcut1,
        debit_segment3_shortcut2: item.segment_3?.shortcut2,
        debit_remarks: item.memo,
        
        // Credit fields (empty for debit line)
        credit_account_item: null,
        credit_account_item_code: null,
        credit_account_item_display_name: null,
        credit_shortcut1: null,
        credit_shortcut2: null,
        credit_amount: null,
        credit_tax_code: null,
        credit_tax_amount: null,
        credit_tax_type: null,
        credit_tax_rate: null,
        credit_reduced_tax_flag: null,
        credit_partner_code: null,
        credit_partner_name: null,
        credit_partner_shortcut1: null,
        credit_partner_shortcut2: null,
        credit_item_name: null,
        credit_item_shortcut1: null,
        credit_item_shortcut2: null,
        credit_section_name: null,
        credit_section_shortcut1: null,
        credit_section_shortcut2: null,
        credit_memo: null,
        credit_memo_shortcut1: null,
        credit_memo_shortcut2: null,
        credit_segment1: null,
        credit_segment1_shortcut1: null,
        credit_segment1_shortcut2: null,
        credit_segment2: null,
        credit_segment2_shortcut1: null,
        credit_segment2_shortcut2: null,
        credit_segment3: null,
        credit_segment3_shortcut1: null,
        credit_segment3_shortcut2: null,
        credit_remarks: null
      };
      result.push(line);
    });
    
    // Process credit items
    creditItems.forEach((item, index) => {
      const line = {
        ...commonData,
        no: lineNo++,
        entry_line_no: debitItems.length + index + 1,
        
        // Debit fields (empty for credit line)
        debit_account_item: null,
        debit_account_item_code: null,
        debit_account_item_display_name: null,
        debit_shortcut1: null,
        debit_shortcut2: null,
        debit_amount: null,
        debit_tax_code: null,
        debit_tax_amount: null,
        debit_tax_type: null,
        debit_tax_rate: null,
        debit_reduced_tax_flag: null,
        debit_partner_code: null,
        debit_partner_name: null,
        debit_partner_shortcut1: null,
        debit_partner_shortcut2: null,
        debit_item_name: null,
        debit_item_shortcut1: null,
        debit_item_shortcut2: null,
        debit_section_name: null,
        debit_section_shortcut1: null,
        debit_section_shortcut2: null,
        debit_memo: null,
        debit_memo_shortcut1: null,
        debit_memo_shortcut2: null,
        debit_segment1: null,
        debit_segment1_shortcut1: null,
        debit_segment1_shortcut2: null,
        debit_segment2: null,
        debit_segment2_shortcut1: null,
        debit_segment2_shortcut2: null,
        debit_segment3: null,
        debit_segment3_shortcut1: null,
        debit_segment3_shortcut2: null,
        debit_remarks: null,
        
        // Credit fields
        credit_account_item: item.account_item?.name,
        credit_account_item_code: item.account_item?.code,
        credit_account_item_display_name: item.account_item?.account_category,
        credit_shortcut1: item.account_item?.shortcut1,
        credit_shortcut2: item.account_item?.shortcut2,
        credit_amount: item.amount,
        credit_tax_code: item.tax_code,
        credit_tax_amount: item.tax?.amount || 0,
        credit_tax_type: item.tax?.type,
        credit_tax_rate: item.tax?.rate,
        credit_reduced_tax_flag: item.tax?.reduced || false,
        credit_partner_code: item.partner?.code,
        credit_partner_name: item.partner?.name,
        credit_partner_shortcut1: item.partner?.shortcut1,
        credit_partner_shortcut2: item.partner?.shortcut2,
        credit_item_name: item.item?.name,
        credit_item_shortcut1: item.item?.shortcut1,
        credit_item_shortcut2: item.item?.shortcut2,
        credit_section_name: item.section?.name,
        credit_section_shortcut1: item.section?.shortcut1,
        credit_section_shortcut2: item.section?.shortcut2,
        credit_memo: item.description,
        credit_memo_shortcut1: item.tag_ids?.[0],
        credit_memo_shortcut2: item.tag_ids?.[1],
        credit_segment1: item.segment_1?.name,
        credit_segment1_shortcut1: item.segment_1?.shortcut1,
        credit_segment1_shortcut2: item.segment_1?.shortcut2,
        credit_segment2: item.segment_2?.name,
        credit_segment2_shortcut1: item.segment_2?.shortcut1,
        credit_segment2_shortcut2: item.segment_2?.shortcut2,
        credit_segment3: item.segment_3?.name,
        credit_segment3_shortcut1: item.segment_3?.shortcut1,
        credit_segment3_shortcut2: item.segment_3?.shortcut2,
        credit_remarks: item.memo
      };
      result.push(line);
    });
  });
  
  return result;
}
