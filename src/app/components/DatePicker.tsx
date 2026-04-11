'use client'

import { useState, useEffect } from 'react'

type DatePickerProps = {
  value: string
  onChange: (date: string) => void
  label?: string
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function DatePicker({ value, onChange, label }: DatePickerProps) {
  const today = toLocalDateString(new Date())
  const maxDate = toLocalDateString(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))

  return (
    <div className="datepicker-wrap">
      {label && <label className="datepicker-label">{label}</label>}
      <input
        type="date"
        className="datepicker-input"
        value={value}
        min={today}
        max={maxDate}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
