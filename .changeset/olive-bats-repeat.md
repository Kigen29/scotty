---
"scotty": patch
---

Remove the unused sonner toaster.

The app mounted two toast systems. Only one was ever used: every `toast()` call
site imports `useToast` from `@/hooks/use-toast`, the Radix toaster. sonner's
`<Toaster>` was rendered in `App.tsx` and its `toast()` was never called from
anywhere, so it shipped in the bundle and displayed nothing.

Removes the mount, the wrapper component and the dependency. Verified by driving
the real sign-in form with bad credentials: the toast still appears, and no
sonner element remains in the DOM.
