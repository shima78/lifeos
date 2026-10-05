'use client';

import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCompanies } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Pick an existing company or type a new name. The value is always the company name. */
export function CompanyCombobox({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: companies = [] } = useCompanies();

  const typed = search.trim();
  const exactMatch = companies.some((c) => c.name.toLowerCase() === typed.toLowerCase());

  const select = (name: string) => {
    onChange(name);
    setSearch('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            'w-full justify-between font-normal aria-invalid:border-destructive',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="text-muted-foreground" />
            <span className="truncate">{value || 'Select or type a company'}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput
            placeholder="Search or type a new company"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{typed ? 'No existing company' : 'No companies yet'}</CommandEmpty>
            {typed && !exactMatch && (
              <CommandGroup>
                <CommandItem value={`__create__${typed}`} onSelect={() => select(typed)}>
                  <Plus /> Create “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            {companies.length > 0 && (
              <CommandGroup heading="Companies">
                {companies.map((c) => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => select(c.name)}>
                    <Check
                      className={cn(
                        value.toLowerCase() === c.name.toLowerCase() ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
