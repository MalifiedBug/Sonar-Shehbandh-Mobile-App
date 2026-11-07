-- Razorpay replaces Cashfree: order_id now holds the Razorpay order id (order_xxx).
alter table sonar.payments
  add column if not exists provider text not null default 'cashfree',
  add column if not exists razorpay_payment_id text;
create unique index if not exists payments_rzp_payment_uq on sonar.payments(razorpay_payment_id) where razorpay_payment_id is not null;

-- Old Cashfree orders can no longer be paid.
update sonar.payments set status = 'EXPIRED' where provider = 'cashfree' and status = 'ACTIVE';
