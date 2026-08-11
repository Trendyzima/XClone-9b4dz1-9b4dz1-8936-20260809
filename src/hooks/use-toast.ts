import { toast as sonnerToast } from "sonner"

export type ToastVariant = "default" | "destructive"

export interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

function toast(options: ToastOptions) {
  const { title, description, variant, duration, action } = options

  if (variant === "destructive") {
    sonnerToast.error(title ?? description ?? "Error", {
      description: title ? description : undefined,
      duration,
      action: action
        ? { label: action.label, onClick: action.onClick }
        : undefined,
    })
  } else {
    sonnerToast(title ?? description ?? "Notification", {
      description: title ? description : undefined,
      duration,
      action: action
        ? { label: action.label, onClick: action.onClick }
        : undefined,
    })
  }
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => {
      if (toastId !== undefined) {
        sonnerToast.dismiss(toastId as string)
      } else {
        sonnerToast.dismiss()
      }
    },
    toasts: [] as ToastOptions[],
  }
}

export { useToast, toast }
