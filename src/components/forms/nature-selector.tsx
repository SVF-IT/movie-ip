'use client'

import { useEffect, useState } from 'react'
import { natureKey } from '@/lib/utils/rights-types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NatureSelectorProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  allowCustom?: boolean
  extraOptions?: string[]
  excludeOptions?: string[]
}

export function NatureSelector({
  value,
  onValueChange,
  disabled = false,
  allowCustom = true,
  extraOptions = [],
  excludeOptions = []
}: NatureSelectorProps) {
  const [isCustom, setIsCustom] = useState(false)
  const [customValue, setCustomValue] = useState('')

  // The three natures a right can be given, in canonical spelling and casing.
  // Anything else goes through "Other…" as a free-text value. The database
  // holds free text, so imports introduced variants ("Non-exclusive",
  // "shared-Exclusive"); sql/33 folds those onto these spellings.
  const baseAllowedNatures = ['Exclusive', 'Non-Exclusive', 'Shared-Exclusive'];

  /**
   * The canonical list is the source of truth. It used to be intersected with a
   * rights_nature_types lookup table, which meant an option vanished whenever
   * the stored spelling differed — 'Shared-Exclusive' was invisible for exactly
   * that reason, seeded as 'Shared Exclusive' with a space. That table is gone.
   */
  const visibleNatureTypes = [...baseAllowedNatures, ...extraOptions]
    .filter((name, i, arr) => arr.indexOf(name) === i && !excludeOptions.includes(name))
    .map((name) => ({ id: name, name }))

  const allAllowedNatures = [...baseAllowedNatures.filter(n => !excludeOptions.includes(n)), ...extraOptions]

  useEffect(() => {
    if (!value) return // empty = "Other..." just clicked; don't touch isCustom
    // Matched on the folded key so a record saved as "shared-Exclusive" opens
    // on the Shared-Exclusive option rather than falling through to "Other".
    if (!allAllowedNatures.some((n) => natureKey(n) === natureKey(value))) {
      setIsCustom(true)
      setCustomValue(value)
    } else {
      setIsCustom(false)
    }
  }, [value, excludeOptions, extraOptions])

  const handleSelectChange = (val: string) => {
    if (val === 'other') {
      setIsCustom(true)
      onValueChange('') // Clear value to prompt input
    } else {
      setIsCustom(false)
      onValueChange(val)
    }
  }

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCustomValue(val)
    onValueChange(val)
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            // A stored variant ("shared-Exclusive") must resolve to the exact
            // canonical option string, or Radix finds no match and shows blank.
            value={isCustom
              ? 'other'
              : (visibleNatureTypes.find((t) => natureKey(t.name) === natureKey(value || ''))?.name ?? value)}
            onValueChange={handleSelectChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select nature..." />
            </SelectTrigger>
            <SelectContent>
              {visibleNatureTypes.map((type) => (
                <SelectItem key={type.id} value={type.name}>
                  {type.name}
                </SelectItem>
              ))}
              {allowCustom && (
                <SelectItem value="other">Other...</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isCustom && (
        <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <Label htmlFor="custom-nature" className="text-xs font-medium text-muted-foreground ml-1">Custom Nature Name</Label>
          <Input
            id="custom-nature"
            placeholder="Enter custom nature..."
            value={customValue}
            onChange={handleCustomInputChange}
            disabled={disabled}
            className="h-9"
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
