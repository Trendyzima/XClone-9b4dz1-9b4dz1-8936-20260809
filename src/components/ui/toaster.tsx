/**
 * Toaster — shadcn/ui-compatible export.
 * The actual toast rendering is handled by <Sonner /> already mounted in App.tsx.
 * This component is a no-op placeholder so imports compile without errors.
 */
export function Toaster() {
  // Sonner handles rendering via the <Sonner position="top-center" richColors />
  // already mounted in App.tsx — no second mount needed here.
  return null
}
