
import * as React from "react"
import { cn } from "@/lib/utils"

// Simplified button without radix/cva if not installed
// But using manual approach for simplicity

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' }>(
  ({ className, variant = 'default', ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2"
    
    let variantStyles = ""
    switch (variant) {
      case 'default':
        variantStyles = "bg-primary text-primary-foreground hover:bg-primary/90"
        break;
      case 'outline':
        variantStyles = "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        break;
      case 'ghost':
        variantStyles = "hover:bg-accent hover:text-accent-foreground"
        break;
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles, className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
