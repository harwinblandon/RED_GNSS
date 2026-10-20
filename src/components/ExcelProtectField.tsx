/**
 * Contraseña opcional para proteger las hojas del Excel descargado. Se queda
 * en la memoria de la página: no se guarda ni se envía a ningún lado.
 */
export function ExcelProtectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      <span className="font-medium text-slate-700 dark:text-slate-300">Proteger Excel con contraseña</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(opcional)"
        autoComplete="new-password"
        className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <span>{value ? 'Las hojas quedan bloqueadas: se pueden ver, copiar y filtrar, pero no editar.' : 'Sin contraseña, el archivo se puede editar.'}</span>
    </label>
  )
}
