function convertDmsToDecimal(value: string, limit: number): number {
  const match = /^\s*([+-]?\d+)\s*(?:°|º|§|\uFFFD)?\s*(\d{1,2})\s*'\s*(\d{1,2}(?:[.,]\d+)?)\s*"\s*$/.exec(value);

  if (!match) {
    throw new Error('Coordenada inválida. Use o formato: -22° 32\' 50".');
  }

  const signedDegrees = Number(match[1]);
  const degrees = Math.abs(signedDegrees);
  const minutes = Number(match[2]);
  const seconds = Number(match[3].replace(',', '.'));

  if (minutes >= 60 || seconds >= 60) {
    throw new Error('Minutos e segundos devem ser menores que 60.');
  }

  if (degrees > limit || (degrees === limit && (minutes > 0 || seconds > 0))) {
    throw new Error(`A coordenada excede o limite de ${limit} graus.`);
  }

  const sign = signedDegrees < 0 ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

export function converterLatitudeDmsParaDd(value: string): number {
  return convertDmsToDecimal(value, 90);
}

export function converterLongitudeDmsParaDd(value: string): number {
  return convertDmsToDecimal(value, 180);
}
