'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert, FormControl,
  InputLabel, Select, MenuItem, Stack, Chip, ToggleButton, ToggleButtonGroup,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
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
  { key: 'voltage', label: 'Напряжение (В)', short: 'U, В', color: '#2196f3' },
  { key: 'current', label: 'Ток (А)', short: 'I, А', color: '#f44336' },
  { key: 'charge', label: 'Заряд (Кл)', short: 'Q, Кл', color: '#4caf50' },
  { key: 'resistance', label: 'Сопротивление (Ом)', short: 'R, Ом', color: '#ff9800' },
  { key: 'temperature', label: 'Температура (°C)', short: 'T, °C', color: '#9c27b0' },
  { key: 'humidity', label: 'Влажность (%)', short: 'H, %', color: '#00bcd4' },
  { key: 'source', label: 'Источник', short: 'Src', color: '#795548' },
  { key: 'math_value', label: 'Math', short: 'Math', color: '#607d8b' },
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
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    listExperiments().then((res) => setExperiments(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (experimentId !== null) setSelectedExpId(experimentId);
  }, [experimentId]);

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

  const labels = useMemo(
    () => measurements.map((m) => new Date(m.recorded_at).toLocaleTimeString('ru-RU')),
    [measurements]
  );

  const fmtVal = (v: number) => {
    if (Math.abs(v) >= 999) return '—';
    if (v === 0) return '0';
    if (Math.abs(v) < 0.001) return v.toExponential(3);
    return v.toFixed(4).replace(/\.?0+$/, '');
  };

  const makeDatasets = (params: ParamKey[]) =>
    params.map((key) => {
      const param = PARAMS.find((p) => p.key === key)!;
      return {
        label: param.label,
        data: measurements.map((m) => {
          const v = m[key] as number;
          return Math.abs(v) >= 999 ? null : v;
        }),
        borderColor: param.color,
        backgroundColor: param.color + '33',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
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
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' as const },
      },
    },
    scales: { x: { ticks: { maxTicksLimit: 20, maxRotation: 45 } } },
  });

  const visibleParams = PARAMS.filter((p) => activeParams.includes(p.key));

  return (
    <Box>
      {/* Experiment selector + view toggle */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }} alignItems={{ md: 'center' }}>
        <FormControl sx={{ minWidth: 300 }} size="small">
          <InputLabel>Эксперимент</InputLabel>
          <Select
            value={selectedExpId ?? ''}
            label="Эксперимент"
            onChange={(e) => setSelectedExpId(e.target.value as number)}
          >
            {experiments.map((exp) => {
              const d = exp.start_time ? new Date(exp.start_time) : null;
              const date = d ? d.toLocaleDateString('ru-RU') : '';
              const time = d ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
              const author = exp.user ? `${exp.user.first_name} ${exp.user.last_name}` : '';
              return (
                <MenuItem key={exp.id} value={exp.id}>
                  {exp.name}{author ? ` — ${author}` : ''}{date ? `, ${date} ${time}` : ''}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small">
          <ToggleButton value="chart">График</ToggleButton>
          <ToggleButton value="table">Таблица</ToggleButton>
        </ToggleButtonGroup>

        {experiment && (
          <Typography variant="body2" color="text.secondary">
            {experiment.name} | {measurements.length} изм.
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {!selectedExpId && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Выберите эксперимент из списка</Typography>
        </Paper>
      )}

      {loading && <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>}

      {selectedExpId && !loading && measurements.length > 0 && (
        <>
          {/* Parameter chips */}
          <Paper sx={{ p: 1, mb: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Параметры:</Typography>
              {PARAMS.map((p) => (
                <Chip
                  key={p.key}
                  label={p.short}
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
          </Paper>

          {viewMode === 'chart' && (
            <>
              <ToggleButtonGroup
                value={chartMode} exclusive onChange={(_, v) => v && setChartMode(v)}
                size="small" sx={{ mb: 1.5 }}
              >
                <ToggleButton value="combined">Совмещённый</ToggleButton>
                <ToggleButton value="separate">Раздельный</ToggleButton>
              </ToggleButtonGroup>

              {chartMode === 'combined' ? (
                <Paper sx={{ p: 1, height: { xs: 300, md: 450 } }}>
                  <Line data={{ labels, datasets: makeDatasets(activeParams) }} options={chartOptions('')} />
                </Paper>
              ) : (
                <Stack spacing={1.5}>
                  {activeParams.map((key) => {
                    const param = PARAMS.find((p) => p.key === key)!;
                    return (
                      <Paper key={key} sx={{ p: 1, height: { xs: 220, md: 300 } }}>
                        <Line data={{ labels, datasets: makeDatasets([key]) }} options={chartOptions(param.label)} />
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </>
          )}

          {viewMode === 'table' && (
            <TableContainer component={Paper} sx={{ maxHeight: { xs: 400, md: 600 } }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Время</TableCell>
                    {visibleParams.map((p) => (
                      <TableCell key={p.key} sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: p.color }}>
                        {p.short}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {measurements.map((m, i) => (
                    <TableRow key={m.id} hover>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(m.recorded_at).toLocaleTimeString('ru-RU')}
                      </TableCell>
                      {visibleParams.map((p) => (
                        <TableCell key={p.key} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {fmtVal(m[p.key] as number)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
