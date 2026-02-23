'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert, FormControl,
  InputLabel, Select, MenuItem, Stack, Chip, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, TimeScale,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';
import { getExperimentData, listExperiments } from '@/api';
import type { Experiment, Measurement } from '@/types';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, TimeScale, zoomPlugin,
);

interface Props {
  experimentId: number | null;
}

const PARAMS = [
  { key: 'voltage', label: 'Напряжение (В)', color: '#2196f3' },
  { key: 'current', label: 'Ток (А)', color: '#f44336' },
  { key: 'charge', label: 'Заряд (Кл)', color: '#4caf50' },
  { key: 'resistance', label: 'Сопротивление (Ом)', color: '#ff9800' },
  { key: 'temperature', label: 'Температура (°C)', color: '#9c27b0' },
  { key: 'humidity', label: 'Влажность (%)', color: '#00bcd4' },
  { key: 'source', label: 'Источник', color: '#795548' },
  { key: 'math_value', label: 'Math', color: '#607d8b' },
] as const;

type ParamKey = typeof PARAMS[number]['key'];

export default function GraphsTab({ experimentId }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<number | null>(experimentId);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeParams, setActiveParams] = useState<ParamKey[]>(['voltage', 'current']);
  const [chartMode, setChartMode] = useState<'combined' | 'separate'>('combined');

  // Load experiments list
  useEffect(() => {
    listExperiments()
      .then((res) => setExperiments(res.data))
      .catch(() => {});
  }, []);

  // Sync prop
  useEffect(() => {
    if (experimentId !== null) setSelectedExpId(experimentId);
  }, [experimentId]);

  // Load experiment data
  useEffect(() => {
    if (selectedExpId === null) return;
    setLoading(true);
    setError('');
    getExperimentData(selectedExpId)
      .then((res) => {
        setExperiment(res.data.experiment);
        setMeasurements(res.data.measurements || []);
      })
      .catch((e) => setError(e.response?.data?.error || 'Ошибка загрузки данных'))
      .finally(() => setLoading(false));
  }, [selectedExpId]);

  const toggleParam = (key: ParamKey) => {
    setActiveParams((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  // Filter out 999-value temperature/humidity (sensor not connected)
  const filteredMeasurements = useMemo(() => measurements, [measurements]);

  const labels = useMemo(
    () => filteredMeasurements.map((m) => new Date(m.recorded_at).toLocaleTimeString('ru-RU')),
    [filteredMeasurements]
  );

  const makeDatasets = (params: ParamKey[]) =>
    params.map((key) => {
      const param = PARAMS.find((p) => p.key === key)!;
      return {
        label: param.label,
        data: filteredMeasurements.map((m) => m[key] as number),
        borderColor: param.color,
        backgroundColor: param.color + '33',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
      };
    });

  const chartOptions = (title: string) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: true, position: 'top' as const },
      title: { display: !!title, text: title },
      zoom: {
        pan: { enabled: true, mode: 'x' as const },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x' as const,
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 20, maxRotation: 45 },
      },
    },
  });

  return (
    <Box>
      {/* Experiment selector */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems="center">
        <FormControl sx={{ minWidth: 300 }} size="small">
          <InputLabel>Эксперимент</InputLabel>
          <Select
            value={selectedExpId ?? ''}
            label="Эксперимент"
            onChange={(e) => setSelectedExpId(e.target.value as number)}
          >
            {experiments.map((exp) => (
              <MenuItem key={exp.id} value={exp.id}>
                #{exp.id} — {exp.name} ({exp.status})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {experiment && (
          <Typography variant="body2" color="text.secondary">
            {experiment.name} | Измерений: {measurements.length}
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!selectedExpId && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Выберите эксперимент из списка или нажмите «Открыть» в таблице экспериментов
          </Typography>
        </Paper>
      )}

      {loading && <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>}

      {selectedExpId && !loading && measurements.length > 0 && (
        <>
          {/* Parameter selector */}
          <Paper sx={{ p: 1.5, mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>Параметры:</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
              {PARAMS.map((p) => (
                <Chip
                  key={p.key}
                  label={p.label}
                  onClick={() => toggleParam(p.key)}
                  color={activeParams.includes(p.key) ? 'primary' : 'default'}
                  variant={activeParams.includes(p.key) ? 'filled' : 'outlined'}
                  size="small"
                  sx={{
                    borderColor: p.color,
                    ...(activeParams.includes(p.key) ? { bgcolor: p.color, color: '#fff' } : {}),
                  }}
                />
              ))}
            </Box>
            <ToggleButtonGroup
              value={chartMode}
              exclusive
              onChange={(_, v) => v && setChartMode(v)}
              size="small"
            >
              <ToggleButton value="combined">Совмещённый</ToggleButton>
              <ToggleButton value="separate">Раздельные</ToggleButton>
            </ToggleButtonGroup>
          </Paper>

          {/* Charts */}
          {chartMode === 'combined' ? (
            <Paper sx={{ p: 2, height: { xs: 350, md: 500 } }}>
              <Line
                data={{ labels, datasets: makeDatasets(activeParams) }}
                options={chartOptions('')}
              />
            </Paper>
          ) : (
            <Stack spacing={2}>
              {activeParams.map((key) => {
                const param = PARAMS.find((p) => p.key === key)!;
                return (
                  <Paper key={key} sx={{ p: 2, height: { xs: 250, md: 350 } }}>
                    <Line
                      data={{ labels, datasets: makeDatasets([key]) }}
                      options={chartOptions(param.label)}
                    />
                  </Paper>
                );
              })}
            </Stack>
          )}
        </>
      )}

      {selectedExpId && !loading && measurements.length === 0 && !error && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Нет данных для этого эксперимента</Typography>
        </Paper>
      )}
    </Box>
  );
}
