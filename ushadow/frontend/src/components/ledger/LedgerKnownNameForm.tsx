/**
 * Form to add a known name (word list entry): name, other names, type.
 */

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { SettingField } from '../settings'
import { ledger } from '../../testing/ui-contract'
import { parseAliases } from './ledgerFormat'
import {
  KNOWN_ENTITY_TYPES,
  type KnownEntityInput,
  type KnownEntityType,
} from '../../services/ledgerApi'

const schema = z.object({
  name: z.string().trim().min(1, 'A name is required'),
  aliases: z.string(),
  type: z.string(),
})
type FormData = z.infer<typeof schema>

const defaultValues: FormData = { name: '', aliases: '', type: '' }

const TYPE_OPTIONS = [
  { value: '', label: 'Not set' },
  ...KNOWN_ENTITY_TYPES.map((type) => ({ value: type, label: type })),
]

const toEntry = (data: FormData): KnownEntityInput => ({
  name: data.name.trim(),
  aliases: parseAliases(data.aliases),
  type: (data.type || null) as KnownEntityType | null,
})

export interface LedgerKnownNameFormProps {
  /** Adds the entry; the form is cleared when it resolves */
  onAdd: (entry: KnownEntityInput) => Promise<unknown>
  isAdding: boolean
}

export default function LedgerKnownNameForm({ onAdd, isAdding }: LedgerKnownNameFormProps) {
  const ids = ledger.knownNames
  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const submit = handleSubmit(async (data) => {
    try {
      await onAdd(toEntry(data))
      reset(defaultValues)
    } catch {
      // The hook shows the error as a toast; keep the values so the user can try again
    }
  })

  return (
    <form
      onSubmit={submit}
      className="card p-4 grid gap-4 md:grid-cols-[1fr_1fr_12rem_auto] md:items-start"
      data-testid={ids.form}
    >
      <Controller
        name="name"
        control={control}
        render={({ field }) => (
          <SettingField
            id={ids.nameField}
            name={field.name}
            type="text"
            label="Name"
            required
            value={field.value}
            onChange={field.onChange}
            placeholder="e.g. Mill One"
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        name="aliases"
        control={control}
        render={({ field }) => (
          <SettingField
            id={ids.aliasesField}
            name={field.name}
            type="text"
            label="Other names"
            description="Other ways this name is said or written, separated by commas."
            value={field.value}
            onChange={field.onChange}
            placeholder="comma separated"
          />
        )}
      />
      <Controller
        name="type"
        control={control}
        render={({ field }) => (
          <SettingField
            id={ids.typeField}
            name={field.name}
            type="select"
            label="Type"
            value={field.value}
            onChange={field.onChange}
            options={TYPE_OPTIONS}
          />
        )}
      />
      <button
        type="submit"
        disabled={isAdding}
        className="btn-primary flex items-center justify-center gap-2 md:mt-6"
        data-testid={ids.add}
      >
        <Plus className="w-4 h-4" />
        {isAdding ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}
