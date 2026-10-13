-- Self-signups no longer confirm their email: the landlord approves or rejects
-- every request, which is the check that matters. With confirmation off in the
-- project, Supabase stamps email_confirmed_at at signup and the existing insert
-- trigger copies it into registration_requests.email_verified_at.
--
-- Requests made before the switch may still be waiting on a link nobody will
-- click, and approval refuses an unverified request. Confirm those accounts;
-- on_auth_user_email_confirmed marks each request verified, audits it and lets
-- the landlord know it is ready for review. Invitations are left alone: those
-- are confirmed when the tenant accepts the invite.
update auth.users u
set email_confirmed_at = now()
where u.email_confirmed_at is null
  and exists (
    select 1
    from public.registration_requests r
    where r.user_id = u.id
      and r.status = 'pending'
      and r.source = 'self_signup'
  );
