alter table public.custom_field_definitions
drop constraint if exists custom_field_definitions_field_type_check;

alter table public.custom_field_definitions
add constraint custom_field_definitions_field_type_check
check (field_type in ('text', 'textarea', 'number', 'date', 'datetime', 'boolean', 'select', 'multi_select'));
