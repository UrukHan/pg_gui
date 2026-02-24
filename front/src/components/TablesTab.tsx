'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControlLabel,
  Switch, Alert, CircularProgress, Chip, InputLabel, FormControl,
  Typography, Stack, Collapse, Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAuth } from '@/context/AuthContext';
import {
  listUsers, createUser, updateUser, deleteUser,
  listExperiments, deleteExperiment,
} from '@/api';
import type { User, Experiment, UserPermission } from '@/types';

interface Props {
  onOpenGraphs: (experimentId: number) => void;
}

export default function TablesTab({ onOpenGraphs }: Props) {
  const [subTab, setSubTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_, v) => setSubTab(v)}
        sx={{ mb: 1, borderBottom: '1px solid #e0e0e0' }}
      >
        <Tab label="Эксперименты" />
        <Tab label="Пользователи" />
      </Tabs>
      {subTab === 0 && <ExperimentsSubTab onOpenGraphs={onOpenGraphs} />}
      {subTab === 1 && <UsersSubTab />}
    </Box>
  );
}

// ==================== EXPERIMENTS ====================

function ExperimentsSubTab({ onOpenGraphs }: { onOpenGraphs: (id: number) => void }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const canDelete = isAdmin || currentUser?.permission === 'read_write_all';

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listExperiments();
      setExperiments(res.data);
    } catch {
      setError('Ошибка загрузки экспериментов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить эксперимент и все его данные?')) return;
    try {
      await deleteExperiment(id);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка удаления');
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'running': return 'success';
      case 'completed': return 'info';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'running': return 'Запущен';
      case 'completed': return 'Завершён';
      case 'stopped': return 'Остановлен';
      case 'error': return 'Ошибка';
      default: return s;
    }
  };

  const fmtDateLine1 = (s: string | null) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('ru-RU'); } catch { return '—'; }
  };
  const fmtTimeLine2 = (s: string | null) => {
    if (!s) return '';
    try { return new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };

  if (loading) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}

      <Stack spacing={1}>
        {experiments.map((exp) => (
          <Paper key={exp.id} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, cursor: 'pointer', '&:hover': { bgcolor: '#fafafa' } }}
              onClick={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
            >
              {/* Date + time */}
              <Box sx={{ minWidth: 65, flexShrink: 0, mr: 1.5 }}>
                <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
                  {fmtDateLine1(exp.start_time)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtTimeLine2(exp.start_time)}
                </Typography>
              </Box>

              {/* Name + author */}
              <Box sx={{ flexGrow: 1, minWidth: 0, mr: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{exp.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {exp.user ? `${exp.user.first_name} ${exp.user.last_name}` : `ID ${exp.user_id}`}
                </Typography>
              </Box>

              {/* Status */}
              <Chip
                label={statusLabel(exp.status)}
                color={statusColor(exp.status) as any}
                size="small"
                sx={{ flexShrink: 0, mr: 0.5 }}
              />

              {/* Actions */}
              <IconButton size="small" title="Статистика" onClick={(e) => { e.stopPropagation(); onOpenGraphs(exp.id); }}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
              {canDelete && (
                <IconButton size="small" title="Удалить" onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
              {expandedId === exp.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </Box>

            <Collapse in={expandedId === exp.id}>
              <Divider />
              <Box sx={{ px: 1.5, py: 1, bgcolor: '#f9f9f9' }}>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Окончание</Typography>
                    <Typography variant="body2">
                      {exp.end_time ? `${fmtDateLine1(exp.end_time)} ${fmtTimeLine2(exp.end_time)}` : '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Приборы</Typography>
                    <Typography variant="body2">{exp.instrument_ids || '—'}</Typography>
                  </Box>
                  {exp.notes && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Заметки</Typography>
                      <Typography variant="body2">{exp.notes}</Typography>
                    </Box>
                  )}
                </Stack>
              </Box>
            </Collapse>
          </Paper>
        ))}
        {experiments.length === 0 && (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">Нет экспериментов</Typography>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}

// ==================== USERS ====================

const truncSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

function UsersSubTab() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', position: '', login: '', password: '',
    permission: 'read_own' as UserPermission, instrument_access: false,
  });

  const load = useCallback(async () => {
    try {
      const res = await listUsers();
      setUsers(res.data);
    } catch {
      setError('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      if (editingUser) {
        const data: Record<string, unknown> = {
          first_name: form.first_name,
          last_name: form.last_name,
          position: form.position,
          login: form.login,
          permission: form.permission,
          instrument_access: form.instrument_access,
        };
        if (form.password) data.password = form.password;
        await updateUser(editingUser.id, data);
        setSuccess('Пользователь обновлён');
      } else {
        await createUser(form);
        setSuccess('Пользователь создан');
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await deleteUser(id);
      setSuccess('Пользователь удалён');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка удаления');
    }
  };

  const roleLabel = (r: string) => r === 'admin' ? 'Админ' : 'Пользователь';

  if (loading) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {isAdmin && (
        <Box sx={{ mb: 1 }}>
          <Button variant="outlined" size="small" onClick={() => {
            setEditingUser(null);
            setForm({ first_name: '', last_name: '', position: '', login: '', password: '', permission: 'read_own', instrument_access: false });
            setDialogOpen(true);
          }}>
            Добавить пользователя
          </Button>
        </Box>
      )}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Имя</TableCell>
              <TableCell>Должность</TableCell>
              <TableCell>Роль</TableCell>
              {isAdmin && <TableCell align="right">Действия</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell sx={{ maxWidth: 140, ...truncSx }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{u.first_name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>{u.last_name}</Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 120, ...truncSx }}>
                  <Typography variant="body2" noWrap>{u.position || '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={roleLabel(u.role)} color={u.role === 'admin' ? 'warning' : 'default'} size="small" />
                </TableCell>
                {isAdmin && (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton size="small" onClick={() => {
                      setEditingUser(u);
                      setForm({
                        first_name: u.first_name, last_name: u.last_name, position: u.position,
                        login: u.login, password: '', permission: u.permission, instrument_access: u.instrument_access,
                      });
                      setDialogOpen(true);
                    }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    {u.role !== 'admin' && (
                      <IconButton size="small" onClick={() => handleDelete(u.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit user dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}</DialogTitle>
        <DialogContent>
          <TextField label="Имя" fullWidth sx={{ mt: 1, mb: 2 }} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <TextField label="Фамилия" fullWidth sx={{ mb: 2 }} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <TextField label="Должность" fullWidth sx={{ mb: 2 }} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <TextField label="Логин" fullWidth sx={{ mb: 2 }} value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <TextField
            label={editingUser ? 'Новый пароль (оставьте пустым)' : 'Пароль'}
            type="password"
            fullWidth
            sx={{ mb: 2 }}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Доступ к данным</InputLabel>
            <Select
              value={form.permission}
              label="Доступ к данным"
              onChange={(e) => setForm({ ...form, permission: e.target.value as UserPermission })}
            >
              <MenuItem value="read_own">Только свои (чтение + запись)</MenuItem>
              <MenuItem value="read_all">Чтение всех, запись своих</MenuItem>
              <MenuItem value="read_write_all">Полный доступ (чтение + запись всех)</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Switch checked={form.instrument_access} onChange={(e) => setForm({ ...form, instrument_access: e.target.checked })} />}
            label="Доступ к приборам"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave}>Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
