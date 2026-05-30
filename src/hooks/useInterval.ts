// useInterval — setInterval declarativo (padrão Dan Abramov).
// O callback é guardado num ref e atualizado a cada render, então o interval
// sempre chama a versão mais recente sem precisar reagendar (e sem stale closure).
// Passar `delay = null` PAUSA o timer (usado pelo toggle de auto-refresh do dashboard).
//
// @see https://overreacted.io/making-setinterval-declarative-with-react-hooks/

import { useEffect, useRef } from 'react'

export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback)

  // Mantém a referência do callback sempre fresca.
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Agenda/reschedula o tick. delay=null pausa (não cria interval).
  useEffect(() => {
    if (delay === null) return
    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}
