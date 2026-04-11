'use client'

import { useState, useEffect } from 'react'

type DatePickerProps = {
  value: string
  onChange: (date: string) => void
  label?: string
  maxDays?: number  // default 14, parks use 180
}

type DateRangePickerProps = {
  startValue: string
  endValue: string
  onStartChange: (date: string) => void
  onEndChange: (date: string) => void
  label?: string
  maxDays?: number  // how far ahead can check-in go (default 180 for parks)
  maxNights?: number  // max nights between start and end (default 30)
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function DatePicker({ value, onChange, label, maxDays = 14 }: DatePickerProps) {
  const today = toLocalDateString(new Date())
  const maxDate = toLocalDateString(new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000))

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

export function DateRangePicker({ startValue, endValue, onStartChange, onEndChange, label, maxDays = 180, maxNights = 30 }: DateRangePickerProps) {
  const today = toLocalDateString(new Date())
  const maxCheckIn = toLocalDateString(new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000))

  const minEnd = startValue || today
  const maxEndDate = toLocalDateString(new Date((new Date(minEnd).getTime() + maxNights * 24 * 60 * 60 * 1000)))

  // Cap maxEnd at both the maxCheckIn+maxNights AND the global maxDays from now
  const globalMaxEnd = maxCheckIn
  const effectiveMaxEnd = new Date(maxEndDate) < new Date(globalMaxEnd) ? maxEndDate : globalMaxEnd

  // Format nights count
  const nights = startValue && endValue
    ? Math.max(0, Math.round((new Date(endValue).getTime() - new Date(startValue).getTime()) / (24 * 60 * 60 * 1000)))
    : null

  return (
    <div className="daterange-wrap">
      {label && <label className="datepicker-label">{label}</label>}
      <div className="daterange-inputs">
        <div className="daterange-field">
          <span className="daterange-field-label">Check-in</span>
          <input
            type="date"
            className="datepicker-input"
            value={startValue}
            min={today}
            max={maxCheckIn}
            onChange={(e) => {
              onStartChange(e.target.value)
              // If end is before new start, auto-advance end to start+1
              if (endValue && e.target.value && endValue < e.target.value) {
                onEndChange('')
              }
            }}
          />
        </div>
        <span className="daterange-arrow">→</span>
        <div className="daterange-field">
          <span className="daterange-field-label">Check-out</span>
          <input
            type="date"
            className="datepicker-input"
            value={endValue}
            min={startValue || today}
            max={effectiveMaxEnd}
            onChange={(e) => onEndChange(e.target.value)}
          />
        </div>
      </div>
      {nights !== null && nights > 0 && (
        <span className="daterange-nights">{nights} night{nights !== 1 ? 's' : ''}</span>
      )}
    </div>
  )
}
