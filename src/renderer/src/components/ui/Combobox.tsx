import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type ComboboxOption = {
  id: string
  label: string
  hint?: string
}

export function Combobox({
  value,
  query,
  onQueryChange,
  options,
  placeholder,
  emptyLabel,
  createLabel,
  onSelect,
  onCreate
}: {
  value?: string
  query: string
  onQueryChange: (value: string) => void
  options: ComboboxOption[]
  placeholder: string
  emptyLabel: string
  createLabel?: string
  onSelect: (id: string) => void
  onCreate?: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const items = useMemo<ComboboxOption[]>(() => {
    const create: ComboboxOption[] =
      onCreate && query.trim().length > 0 && !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase())
        ? [{ id: '__create__', label: createLabel ?? `Create “${query.trim()}”` }]
        : []
    return [...options, ...create]
  }, [createLabel, onCreate, options, query])

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  function choose(index: number) {
    const item = items[index]
    if (!item) return
    if (item.id === '__create__') {
      onCreate?.(query.trim())
    } else {
      onSelect(item.id)
    }
    setOpen(false)
  }

  return (
    <div className="combobox" ref={boxRef}>
      <input
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          onQueryChange(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((index) => Math.min(index + 1, items.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            choose(active)
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {value ? <span className="sr-only">Selected {value}</span> : null}
      {open ? (
        <div className="combobox-menu" id={listId} role="listbox">
          {items.length === 0 ? (
            <div className="combobox-item">{emptyLabel}</div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? 'combobox-item active' : 'combobox-item'}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <div>{item.label}</div>
                {item.hint ? <div className="muted">{item.hint}</div> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
