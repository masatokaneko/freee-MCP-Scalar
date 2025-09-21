export function transformQuickBooksJournals(rawResponse) {
  if (!rawResponse) {
    return [];
  }

  const journals = rawResponse.JournalEntry || [];
  return journals.map((entry) => ({
    source: 'quickbooks',
    entryId: entry.Id,
    date: entry.TxnDate,
    debitAccount: entry.Line?.[0]?.JournalEntryLineDetail?.AccountRef?.value,
    creditAccount: entry.Line?.[1]?.JournalEntryLineDetail?.AccountRef?.value,
    amount: entry.Line?.[0]?.Amount,
    currency: entry.CurrencyRef?.value,
    memo: entry.PrivateNote,
  }));
}
