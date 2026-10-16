import { useEffect, useState } from 'react'
import type { GnssStation } from '../data/stations'
import { getCached, loadSnapshot } from './stationStatus'

/** Fecha del último RINEX por estación (snapshot diario + caché local). */
export function useLatestData(stations: GnssStation[]): Record<string, string | null> {
  const [map, setMap] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let alive = true
    loadSnapshot().then((snap) => {
      if (!alive) return
      const m: Record<string, string | null> = {}
      if (snap) for (const [id, v] of Object.entries(snap.stations)) m[id] = v.lastDate
      for (const s of stations) {
        const c = getCached(s.tId)
        if (c) m[s.id] = c.lastDate
      }
      setMap(m)
    })
    return () => {
      alive = false
    }
  }, [stations])
  return map
}
