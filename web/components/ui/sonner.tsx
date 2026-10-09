"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      // Compact toast: ink on white with a coloured left rule for the status.
      toastOptions={{
        classNames: {
          toast: "cn-toast border-l-4! py-3! px-4! gap-2! text-meta! shadow-pop!",
          description: "text-muted-foreground!",
          success: "border-l-success! [&_[data-icon]]:text-success",
          error: "border-l-destructive! [&_[data-icon]]:text-destructive",
          warning: "border-l-warning! [&_[data-icon]]:text-warning",
          info: "border-l-info! [&_[data-icon]]:text-info",
          loading: "border-l-primary!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
