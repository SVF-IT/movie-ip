'use client'

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Loader2 } from 'lucide-react'
import { getRightsNatureTypes, addNatureType } from '@/lib/api/dashboard'
import type { RightsNatureType } from '@/lib/types/database'

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
  const [natureTypes, setNatureTypes] = useState<RightsNatureType[]>([])
  const [loading, setLoading] = useState(true)
  const [isCustom, setIsCustom] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const baseAllowedNatures = ['Exclusive', 'Non-Exclusive', 'Jointly Owned', 'Sold to Grassroot', 'Sold/Expired'];

  useEffect(() => {
    loadNatureTypes()
  }, [])

  const loadNatureTypes = async () => {
    setLoading(true)
    try {
      const types = await getRightsNatureTypes()
      setNatureTypes(types)
    } catch (error) {
      console.error('Error loading nature types:', error)
    } finally {
      setLoading(false)
    }
  }

  const visibleNatureTypes = natureTypes.filter(t =>
    baseAllowedNatures.includes(t.name) &&
    !excludeOptions.includes(t.name) &&
    (extraOptions.length === 0 || [...baseAllowedNatures, ...extraOptions].includes(t.name))
  )

  const allAllowedNatures = [...baseAllowedNatures.filter(n => !excludeOptions.includes(n)), ...extraOptions]

  useEffect(() => {
    if (!value) return // empty = "Other..." just clicked; don't touch isCustom
    if (!allAllowedNatures.includes(value)) {
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

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
      </Select>
    )
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            value={isCustom ? 'other' : value}
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
                  {type.description && <span className="text-xs text-muted-foreground ml-2">({type.description})</span>}
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
