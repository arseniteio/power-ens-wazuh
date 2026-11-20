import React from 'react';
import type { ENSControlTimelinePoint } from '../../../../common/ens/core/timeline/control-timeline-points';

interface ControlEvolutionChartProps {
  points: ENSControlTimelinePoint[];
  controlId: string;
  pending?: boolean;
}

const HEIGHT = 200;
const WIDTH = 600;

const yCoordinate = (score: number): number =>
  HEIGHT - Math.max(0, Math.min(score, 100)) * 2;

const xCoordinate = (
  index: number,
  total: number
): number => (total === 1 ? WIDTH / 2 : (index * WIDTH) / (total - 1));

const colorOf = (status: string): string => {
  if (status === 'CUMPLE') {
    return '#00A69B';
  }

  if (status === 'PARCIAL') {
    return '#F5A700';
  }

  if (status === 'NO_CUMPLE') {
    return '#BD271E';
  }

  return '#98A2B3';
};

const ReadingLabel = ({
  puntos: dataPoints,
  sinNumero: withoutNumber,
  shortSeries,
}: {
  puntos: { events: number; isCurrent: boolean }[];
  sinNumero: number;
  shortSeries: boolean;
}) => {
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: 12,
          color: '#69707D',
          marginBottom: 6,
        }}
      >
        {[
          { status: 'CUMPLE', text: 'cumple' },
          { status: 'PARCIAL', text: 'parcial' },
          { status: 'NO_CUMPLE', text: 'no cumple' },
        ].map(item => (
          <span
            key={item.status}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: colorOf(item.status),
                display: 'inline-block',
              }}
            />
            {item.text}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              border: '2px solid #1A1C21',
              display: 'inline-block',
            }}
          />
          hoy
        </span>
        <span>· el color es el estado de ESE día, no el de hoy</span>
      </div>

      {(shortSeries || withoutNumber > 0) && (
        <div
          style={{
            fontSize: 12,
            color: '#69707D',
            lineHeight: 1.5,
          }}
        >
          {shortSeries ? (
            <strong>{dataPoints.length} día(s) medido(s): aún no hay tendencia.</strong>
          ) : null}
          {shortSeries && withoutNumber > 0 ? ' ' : null}
          {withoutNumber > 0 ? (
            <>
              {withoutNumber} día(s) sin dibujar: el control no aplicaba a la categoría del sistema
              de esa fecha. No son un cero.
            </>
          ) : null}
        </div>
      )}
    </>
  );
};

export const ControlEvolutionChart = ({
  points,
  controlId,
  pending,
}: ControlEvolutionChartProps) => {
  if (pending && !points.length) {
    return (
      <div style={{ padding: 14, color: '#69707D', background: '#FAFBFC', borderRadius: 6, fontSize: 13 }}>
        Calculando la serie…
      </div>
    );
  }

  const withNumber = points
    .map((point, index) => ({ point, index }))
    .filter(item => typeof item.point.score === 'number');

  const withoutNumber = points.length - withNumber.length;

  if (!withNumber.length) {
    return (
      <div
        style={{
          padding: 14,
          color: '#69707D',
          background: '#FAFBFC',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        Todavía no hay ningún día con cumplimiento medido para {controlId}. La
        línea aparece en cuanto el motor pueda evaluar el control al menos un
        día de la ventana.
      </div>
    );
  }

  const dataPoints = withNumber.map(({ point, index }) => ({
    ...point,
    x: xCoordinate(index, points.length),
    y: yCoordinate(point.score as number),
  }));

  const shortSeries = dataPoints.length < 4;

  const stroke = dataPoints.length
    ? dataPoints
        .map((point, index) => {
          if (index === 0) {
            return `M ${point.x},${point.y}`;
          }

          const previous = dataPoints[index - 1];
          const medium = (previous.x + point.x) / 2;

          return `C ${medium},${previous.y} ${medium},${point.y} ${point.x},${point.y}`;
        })
        .join(' ')
    : '';

  const fill =
    dataPoints.length > 1
      ? `${stroke} L ${dataPoints[dataPoints.length - 1].x},${HEIGHT} L ${dataPoints[0].x},${HEIGHT} Z`
      : '';

  if (dataPoints.length <= 3) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 18,
            height: 190,
            padding: '10px 0 0 10px',
            borderLeft: '1px solid #D3DAE6',
            borderBottom: '1px solid #D3DAE6',
          }}
        >
          {dataPoints.map((point, index) => (
            <div
              key={`${point.label}-${index}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                width: 86,
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: colorOf(point.status),
                  marginBottom: 6,
                }}
              >
                {point.score}%
              </div>

              <div
                style={{
                  width: '100%',
                  height: `${Math.max(2, (point.score as number) * 1.35)}px`,
                  background: colorOf(point.status),
                  borderRadius: '4px 4px 0 0',
                  opacity: point.isCurrent ? 1 : 0.55,
                  border: point.isCurrent
                    ? '2px solid #1A1C21'
                    : '2px solid transparent',
                }}
              />

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#69707D',
                  marginTop: 6,
                }}
              >
                {point.label}
                {point.isCurrent ? ' · hoy' : ''}
              </div>
            </div>
          ))}
        </div>

        <ReadingLabel
          puntos={dataPoints}
          sinNumero={withoutNumber}
          shortSeries
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <div
          style={{
            height: 190,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            color: '#98A2B3',
            fontSize: 11,
            fontWeight: 600,
            paddingTop: 1,
          }}
        >
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        <div
          style={{
            position: 'relative',
            flex: 1,
            height: 190,
            marginBottom: 34,
          }}
        >

        <svg
          width='100%'
          height='190'
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio='none'
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id='ens-evolucion' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='#006BB4' stopOpacity='0.22' />
              <stop offset='100%' stopColor='#006BB4' stopOpacity='0.01' />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map(value => (
            <line
              key={value}
              x1='0'
              y1={yCoordinate(value)}
              x2={WIDTH}
              y2={yCoordinate(value)}
              stroke='#E3E8F0'
              strokeDasharray={value === 0 ? '0' : '4 6'}
              strokeWidth='1'
              vectorEffect='non-scaling-stroke'
            />
          ))}

          {fill && <path d={fill} fill='url(#ens-evolucion)' />}

          <path
            d={stroke}
            fill='none'
            stroke='#006BB4'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            vectorEffect='non-scaling-stroke'
          />
        </svg>

        {dataPoints.map((point, index) => {
          const left = (point.x / WIDTH) * 100;
          const top = (point.y / HEIGHT) * 100;

          const anchor =
            left < 6
              ? 'translate(0, -50%)'
              : left > 94
              ? 'translate(-100%, -50%)'
              : 'translate(-50%, -50%)';

          return (
            <div key={`${point.label}-${index}`}>
              <div
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  top: `${top}%`,
                  transform: 'translate(-50%, -50%)',
                  width: point.isCurrent ? 13 : 9,
                  height: point.isCurrent ? 13 : 9,
                  borderRadius: '50%',
                  background: colorOf(point.status),
                  border: point.isCurrent
                    ? '2.5px solid #1A1C21'
                    : '2px solid #FFFFFF',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
                  zIndex: 2,
                }}
              />

              {(dataPoints.length <= 10 ||
                index === 0 ||
                index === dataPoints.length - 1 ||
                point.isCurrent) && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: `${top}%`,
                    marginTop: -19,
                    transform: anchor,
                    fontSize: 11,
                    fontWeight: 700,
                    color: colorOf(point.status),
                    whiteSpace: 'nowrap',
                    zIndex: 2,
                  }}
                >
                  {point.score}%
                </div>
              )}

              <div
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  bottom: -20,
                  transform:
                    left < 6
                      ? 'translateX(0)'
                      : left > 94
                      ? 'translateX(-100%)'
                      : 'translateX(-50%)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#98A2B3',
                  whiteSpace: 'nowrap',
                }}
              >
                {point.label}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <ReadingLabel
        puntos={dataPoints}
        sinNumero={withoutNumber}
        shortSeries={shortSeries}
      />
    </div>
  );
};
