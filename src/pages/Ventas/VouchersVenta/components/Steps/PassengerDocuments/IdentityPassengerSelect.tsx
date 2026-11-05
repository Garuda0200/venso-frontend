import React, { useEffect, useId, useRef, useState } from 'react';
import { MdCheck, MdExpandMore } from 'react-icons/md';

// Select-only combobox: identity ownership must use an actual passenger ID.
// Keep the list inside the native dialog's top layer, never in document.body.
export default function IdentityPassengerSelect({ value = '', options = [], onChange, disabled = false }: any) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null), trigger = useRef(null);
  const listId = useId();
  const choices = [{ value: '', label: 'Seleccionar pasajero' }, ...options];
  const selected = choices.findIndex(option => String(option.value) === String(value));
  const choose = index => {
    const option = choices[index];
    if (!option || disabled) return;
    setOpen(false); onChange(String(option.value)); trigger.current?.focus();
  };
  const expand = () => { setActive(Math.max(0, selected)); setOpen(true); };
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled, value]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open, listId]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  const keyboard = event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!open) { expand(); return; }
      if (event.key === 'Enter' || event.key === ' ') { choose(active); return; }
      if (event.key === 'Home') setActive(0);
      else if (event.key === 'End') setActive(choices.length - 1);
      else setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    } else if (event.key === 'Tab') setOpen(false);
    else if (event.key.length === 1) {
      const index = choices.findIndex(option => option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (index >= 0) { event.preventDefault(); setActive(index); setOpen(true); }
    }
  };
  return <div ref={root} className="identity-passenger-select">
    <button ref={trigger} type="button" role="combobox" aria-label="Asignar propuesta a pasajero del lote"
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open ? `${listId}-${active}` : undefined}
      className="identity-passenger-select__trigger" disabled={disabled} onKeyDown={keyboard}
      onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}
      onClick={() => open ? setOpen(false) : expand()}>
      <span>{choices[selected]?.label || choices[0].label}</span><MdExpandMore aria-hidden="true" />
    </button>
    {open && <div id={listId} role="listbox" aria-label="Pasajeros del lote" className="identity-passenger-select__list">
      {choices.map((option, index) => <div key={String(option.value)} id={`${listId}-${index}`} role="option"
        aria-selected={String(option.value) === String(value)} className={`identity-passenger-select__option${active === index ? ' is-active' : ''}`}
        onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(index)}>
        <span>{option.label}</span>{String(option.value) === String(value) && <MdCheck aria-hidden="true" />}
      </div>)}
    </div>}
  </div>;
}
