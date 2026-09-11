-- =========================================================================
-- Regency Tailor — an order number, once issued, is final
--
-- The number is what the customer is told, what goes on their bill and what
-- the workshop calls the garments by. It is issued once, by
-- order_number_seq, and after that it belongs to the order.
--
-- The application already avoids sending the column: an insert omits it so the
-- sequence assigns one, and an edit is an UPDATE that never mentions it. That
-- is a convention, and a convention holds only until the next change to the
-- save path. It did not hold: an edit reached the database as an insert,
-- because the object being saved had lost the key identifying its row, and the
-- sequence dutifully issued a second number for an order the showroom had
-- already handed a bill to.
--
-- This makes the rule the database's rather than the client's. Whatever any
-- caller sends — the dashboard, the desktop app, a future script, the SQL
-- Editor — an UPDATE that changes order_number is refused.
--
-- Deliberately not blocked: the restore path sets order numbers on rows it is
-- INSERTing, which is how a backup keeps the numbers it was taken with. This
-- fires only on UPDATE, so a restore is unaffected.
-- =========================================================================

create or replace function public.refuse_order_number_change()
returns trigger
language plpgsql
as $$
begin
    if new.order_number is distinct from old.order_number then
        raise exception
            'Order #% cannot be renumbered (attempted #%). The order number is issued once and is permanent.',
            old.order_number, new.order_number
            using errcode = '23514';
    end if;
    return new;
end;
$$;

drop trigger if exists orders_number_is_immutable on public.orders;

create trigger orders_number_is_immutable
    before update of order_number on public.orders
    for each row
    execute function public.refuse_order_number_change();

comment on function public.refuse_order_number_change() is
    'Refuses any UPDATE that would change orders.order_number. The number is '
    'issued once by order_number_seq and is what the customer was told.';
