// app/components/DynamicAttributeComparator.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  AttributeWeights, 
  VehicleScoreResult 
} from '../../lib/attributeScoring';

interface DynamicAttributeComparatorProps {
  vehicles: any[];
  weights: AttributeWeights;
  onWeightsChange: (weights: AttributeWeights) => void;
  scores: VehicleScoreResult[];
  winnerId: string | null;
}

interface TooltipInfo {
  id: string;
  shortLabel: string;
  icon: string;
  title: string;
  description: string;
}

const ATTRIBUTES: TooltipInfo[] = [
  {
    id: 'motor',
    shortLabel: 'Motor',
    icon: '⚡',
    title: 'Motor y Potencia',
    description: 'Dará más peso a motores con mayor potencia y torque.',
  },
  {
    id: 'seguridad',
    shortLabel: 'Seguridad',
    icon: '🛡️',
    title: 'Seguridad y ADAS',
    description: 'Priorizará cantidad de airbags y sistemas de asistencia (ADAS).',
  },
  {
    id: 'confort',
    shortLabel: 'Tecnología/Confort',
    icon: '📱',
    title: 'Tecnología y Confort',
    description: 'Priorizará techo panorámico, asientos de cuero y conectividad.',
  },
  {
    id: 'economia',
    shortLabel: 'Economía',
    icon: '💰',
    title: 'Economía y Eficiencia',
    description: 'Priorizará el precio del auto y la eficiencia de motorización (La jerarquía de valor es: EV > PHEV > HEV > MHEV > Nafta > Diésel).',
  },
];

export default function DynamicAttributeComparator({
  vehicles,
  weights,
  onWeightsChange,
  scores,
  winnerId,
}: DynamicAttributeComparatorProps) {
  // Tooltip activo (para mobile o click)
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Desglose técnico colapsable (oculto por defecto para evitar sobrecarga de información)
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);

  // Ref para debounce de telemetría silenciosa
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPayloadRef = useRef<string>('');

  // Telemetría silenciosa con debounce
  useEffect(() => {
    if (!vehicles || vehicles.length < 2) return;

    const payloadStr = JSON.stringify({
      weights,
      vIds: vehicles.map(v => v.id).sort(),
    });

    if (payloadStr === lastSavedPayloadRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      lastSavedPayloadRef.current = payloadStr;

      const comboText = vehicles.map(v => `${v.brandName} ${v.modelName}`).join(' vs ');
      const scoresMap: Record<string, number> = {};
      scores.forEach(s => {
        scoresMap[s.vehicleId] = s.totalScore;
      });

      const winnerVeh = vehicles.find(v => v.id === winnerId);

      const firstVeh = vehicles[0];

      addDoc(collection(db, 'comparison_stats'), {
        combo: comboText,
        ids: vehicles.map(v => v.id).sort(),
        slotIds: vehicles.map(v => v.id),
        firstSlotId: firstVeh?.id || '',
        firstSlotModelId: firstVeh?.modelId || '',
        firstSlotModel: firstVeh ? `${firstVeh.brandName} ${firstVeh.modelName}`.trim() : '',
        weights: {
          motor: weights.motor,
          seguridad: weights.seguridad,
          confort: weights.confort,
          economia: weights.economia,
        },
        scores: scoresMap,
        winner: winnerVeh ? `${winnerVeh.brandName} ${winnerVeh.modelName}` : 'Empate o Sin Definir',
        type: 'attribute_weights',
        timestamp: serverTimestamp(),
      }).catch(err => {
        console.warn('Telemetría de ponderación omitida:', err);
      });
    }, 1800);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [weights, vehicles, scores, winnerId]);

  if (!vehicles || vehicles.length < 2) return null;

  const handleSliderChange = (key: keyof AttributeWeights, val: number) => {
    onWeightsChange({ ...weights, [key]: val });
  };

  const applyPreset = (preset: AttributeWeights) => {
    onWeightsChange(preset);
  };

  return (
    <section 
      aria-label="Ponderador Dinámico por Atributos"
      className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 sm:p-5 shadow-sm transition-all"
    >
      {/* 1. BARRA SUPERIOR COMPACTA: TÍTULO + PRESETS RÁPIDOS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#C0C0C0]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00BFFF] shrink-0 animate-pulse"></span>
          <h2 
            className="text-xs sm:text-sm font-black text-[#0A1F33] uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
          >
            Ponderador de Preferencias
          </h2>
          <span className="text-[9px] text-[#3A3A3C] font-semibold hidden md:inline">
            • Ajustá los sliders para calcular el Match en las tarjetas de arriba
          </span>
        </div>

        {/* Presets en formato pills minimalistas */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[8px] font-bold uppercase tracking-widest text-[#C0C0C0] mr-0.5">
            Perfiles:
          </span>
          <button
            type="button"
            onClick={() => applyPreset({ motor: 50, seguridad: 50, confort: 50, economia: 50 })}
            className="text-[9px] font-bold uppercase px-2 py-0.5 border border-[#C0C0C0] hover:border-[#00BFFF] hover:text-[#00BFFF] bg-[#F8F9FA] transition-colors"
          >
            Equilibrado
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ motor: 30, seguridad: 90, confort: 60, economia: 50 })}
            className="text-[9px] font-bold uppercase px-2 py-0.5 border border-[#C0C0C0] hover:border-[#00BFFF] hover:text-[#00BFFF] bg-[#F8F9FA] transition-colors"
          >
            Familiar 🛡️
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ motor: 25, seguridad: 50, confort: 40, economia: 95 })}
            className="text-[9px] font-bold uppercase px-2 py-0.5 border border-[#C0C0C0] hover:border-[#00BFFF] hover:text-[#00BFFF] bg-[#F8F9FA] transition-colors"
          >
            Económico 💰
          </button>
          <button
            type="button"
            onClick={() => applyPreset({ motor: 95, seguridad: 40, confort: 60, economia: 30 })}
            className="text-[9px] font-bold uppercase px-2 py-0.5 border border-[#C0C0C0] hover:border-[#00BFFF] hover:text-[#00BFFF] bg-[#F8F9FA] transition-colors"
          >
            Potencia ⚡
          </button>
        </div>
      </div>

      {/* 2. SLIDERS SELECTORES DE PREFERENCIA (CUADRO ROJO) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 py-3.5 border-b border-[#C0C0C0]">
        {ATTRIBUTES.map(attr => {
          const key = attr.id as keyof AttributeWeights;
          const val = weights[key];
          const isTooltipOpen = activeTooltip === key;

          return (
            <div 
              key={key} 
              className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-2.5 flex flex-col justify-between hover:border-[#00BFFF] transition-colors relative"
            >
              {/* Encabezado del slider en 1 sola línea */}
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[10px]">{attr.icon}</span>
                  <span className="font-bold text-[10px] uppercase tracking-wider text-[#0A1F33] truncate">
                    {attr.shortLabel}
                  </span>
                  
                  {/* Ícono de Tooltip Educativo */}
                  <div className="relative inline-block">
                    <button
                      type="button"
                      aria-label={`Info ${attr.title}`}
                      onClick={() => setActiveTooltip(isTooltipOpen ? null : key)}
                      onMouseEnter={() => setActiveTooltip(key)}
                      onMouseLeave={() => setActiveTooltip(null)}
                      className="w-3.5 h-3.5 rounded-full bg-[#0A1F33]/10 hover:bg-[#00BFFF] hover:text-white text-[#0A1F33] text-[9px] font-bold flex items-center justify-center transition-colors focus:outline-none"
                    >
                      ⓘ
                    </button>

                    {/* Popover Educativo Flotante */}
                    {isTooltipOpen && (
                      <div 
                        role="tooltip"
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 sm:w-64 bg-[#0A1F33] text-[#FFFFFF] text-[10px] p-2.5 shadow-xl z-50 border-t-2 border-[#00BFFF] pointer-events-none leading-snug"
                      >
                        <p className="font-bold uppercase tracking-wider text-[#00BFFF] mb-1">
                          {attr.title}
                        </p>
                        <p className="text-white/90">
                          {attr.description}
                        </p>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#0A1F33]"></div>
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-[10px] font-black text-[#0A1F33] bg-white border border-[#C0C0C0] px-1.5 py-0.2" style={{ fontFamily: 'var(--font-montserrat)' }}>
                  {val}%
                </span>
              </div>

              {/* Slider nativo táctil de bajo perfil */}
              <div className="py-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={val}
                  onChange={e => handleSliderChange(key, Number(e.target.value))}
                  aria-label={`Ponderación para ${attr.title}`}
                  className="w-full h-2 bg-[#E0E0E0] appearance-none cursor-pointer accent-[#00BFFF] focus:outline-none"
                  style={{
                    background: `linear-gradient(to right, #00BFFF 0%, #00BFFF ${val}%, #E0E0E0 ${val}%, #E0E0E0 100%)`
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. BOTÓN OPCIONAL PARA VER DESGLOSE TÉCNICO (SIN DUPLICAR AUTOS NI CTAS) */}
      <div className="pt-2.5 flex items-center justify-between">
        <span className="text-[9px] text-[#3A3A3C] italic">
          El resultado se refleja en vivo en los cuadros de producto de arriba.
        </span>

        <button
          type="button"
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="text-[9px] font-bold uppercase tracking-wider text-[#00BFFF] hover:text-[#0A1F33] transition-colors flex items-center gap-1"
        >
          <span>{showBreakdown ? 'Ocultar desglose de puntos' : 'Ver desglose de puntos'}</span>
          <span>{showBreakdown ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Desglose desplegable opcional */}
      {showBreakdown && (
        <div className="mt-3 pt-3 border-t border-[#C0C0C0]/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map(veh => {
            const res = scores.find(s => s.vehicleId === veh.id);
            if (!res) return null;
            const isWinner = winnerId === veh.id;

            return (
              <div key={veh.id} className={`p-2.5 bg-[#F8F9FA] border text-[9px] ${isWinner ? 'border-[#00BFFF]' : 'border-[#C0C0C0]/60'}`}>
                <div className="flex justify-between items-center font-bold mb-1.5 pb-1 border-b border-[#C0C0C0]/40">
                  <span className="text-[#0A1F33] uppercase truncate">{veh.brandName} {veh.modelName}</span>
                  <span className={isWinner ? 'text-[#00BFFF] font-black' : 'text-[#0A1F33]'}>{res.totalScore}%</span>
                </div>
                <div className="space-y-1 text-[#3A3A3C]">
                  <div className="flex justify-between">
                    <span>⚡ Motor:</span> <span className="font-bold">{res.motorScore} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>🛡️ Seguridad:</span> <span className="font-bold">{res.seguridadScore} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>📱 Confort:</span> <span className="font-bold">{res.confortScore} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>💰 Economía:</span> <span className="font-bold">{res.economiaScore} pts</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. DISCLAIMER COMPRIMIDO AL PIE */}
      <div className="mt-3 pt-2 border-t border-[#C0C0C0]/40 text-center">
        <p className="text-[8px] sm:text-[9px] text-[#3A3A3C]/70 italic leading-tight">
          Los datos mostrados se basan en las fichas técnicas oficiales de las concesionarias. Recomendamos agendar un Test Drive para comprobar el vehículo en persona.
        </p>
      </div>
    </section>
  );
}
