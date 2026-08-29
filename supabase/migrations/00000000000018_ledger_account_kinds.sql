-- Two ledger account kinds the original chart of accounts was missing.
--
-- Postgres will not let a new enum value be *used* in the transaction that
-- adds it, so this migration adds the labels and nothing else. Everything
-- that reads or writes them lives in the next migration.
--
-- `liability` — what the broker owes but has not yet paid out. Withdrawals
-- payable is the case that forced it: the account was classified
-- `clearing`, which the balance view folds debit-normal, as an asset in
-- transit. It does not behave like one. A withdrawal request credits it
-- (we now owe the client a payout) and the payout debits it, so reporting
-- it debit-normal displayed a real liability as a large negative asset.
--
-- `expense` — what the broker funds out of its own pocket: a partner
-- commission, a client rebate, a goodwill credit. Debit-normal like an
-- asset, but it is not one; see the next migration for why the house bank
-- is the wrong account to book these against.
alter type public.ledger_account_kind add value if not exists 'liability';
alter type public.ledger_account_kind add value if not exists 'expense';
