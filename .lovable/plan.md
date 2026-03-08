

# Comprehensive UI/UX Overhaul Plan

## Critical Bug Fix

**The "View Profile" ERR_BLOCKED_BY_RESPONSE error**: The `getProfileUrl` function falls back to `https://www.google.com/search?q=...` which gets blocked in iframe/preview. Fix: use `window.open()` (already done) but the real issue is that the Google search URL gets blocked by Google's X-Frame-Options. Solution: keep using `window.open()` but ensure the click handler is working correctly, and also provide a better fallback than Google Search (e.g., show the lead detail sheet instead of trying to open an external link when no social links exist).

**The team_members → profiles FK error**: Network requests show `PGRST200` - "Could not find a relationship between 'team_members' and 'profiles'". The `useTeam` hook queries `profiles(display_name, email)` via a join, but there's no foreign key from `team_members.user_id` to `profiles.id`. Fix: add a migration to create the FK relationship.

## Architecture: Settings Page Restructuring

Break the monolithic Settings page into a tabbed layout with sub-sections:

| Tab | Contents |
|-----|----------|
| **Profile** | Name, website, services, portfolio links, email signature |
| **Portfolio** | Portfolio projects (AI references) |
| **Discovery** | Discovery pipeline selection, ICP profile, target categories/locations |
| **Email & Channels** | Sender email, daily limit, WhatsApp, social discovery toggle, booking link |
| **Automation** | Autonomous mode, active hours, follow-up intervals |
| **Team** | Team management (existing TeamSettings component) |

## Layout & Navigation Overhaul

### Top Header Bar (new)
- Add a persistent top header across all pages with:
  - Page title (left)
  - Search bar (center, optional)
  - Notification bell (moved from sidebar)
  - Profile avatar dropdown (right) with: user email, sign out, link to settings

### Sidebar Improvements
- Increase font size from `text-[13px]` to `text-sm` (14px)
- Increase font weight for inactive items
- Increase sidebar foreground contrast: change `--sidebar-foreground` from `220 10% 75%` (dark) / `220 10% 85%` (light) to higher contrast values
- Move notification bell and sign-out from sidebar footer to top header
- Keep sidebar clean: only navigation items

## Lead Discovery UX Improvements

1. **Date filter**: Add a DateFilter component (already exists and is used in Campaigns/Conversations/Reports) to the Lead Discovery filter bar
2. **Fix "View Profile" button**: When no social links exist, instead of falling back to a blocked Google search URL, show a toast saying "No external profile available" or construct a Google Maps search URL instead (which doesn't block in iframes)
3. **Better empty states**: More descriptive empty states with illustrations

## Per-Page UI Polish

### All Pages
- Consistent page header pattern with breadcrumb-style subtitle
- Better spacing and visual hierarchy
- Cards with subtle hover effects

### Dashboard
- Add greeting with user's name ("Good morning, Emmanuel")
- Better card shadows and hover states

### Sidebar
- Higher contrast text colors
- Slightly larger icons (h-4.5 w-4.5 equivalent)
- Better active state indicator (left border accent instead of just background)

## Database Migration

Add FK from `team_members.user_id` to `profiles.id`:

```sql
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
```

## Files to Create/Edit

1. **Migration**: Add FK constraint for team_members → profiles
2. **`src/components/AppLayout.tsx`**: Add top header bar with profile dropdown, improve sidebar text contrast/size, move notification bell to header
3. **`src/components/ProfileDropdown.tsx`** (new): Avatar dropdown with user info and sign out
4. **`src/pages/SettingsPage.tsx`**: Restructure into tabbed layout with 6 sub-sections
5. **`src/pages/LeadDiscovery.tsx`**: Add DateFilter, fix getProfileUrl fallback
6. **`src/pages/Dashboard.tsx`**: Add user greeting
7. **`src/index.css`**: Increase sidebar foreground contrast values

## Summary of Changes

- **Bug fixes**: FK relationship for team queries, Google search URL blocking
- **Settings**: Split into 6 organized tabs
- **Navigation**: Profile icon in top-right header, better sidebar readability
- **Lead Discovery**: Date filtering, safer external link handling
- **Visual**: Higher contrast sidebar text, better spacing, consistent headers

