import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  children: ReactNode
}

export function Button({ variant = 'secondary', className, type = 'button', ...props }: Props) {
  return <button type={type} className={cn('btn', `btn-${variant}`, className)} {...props} />
}
