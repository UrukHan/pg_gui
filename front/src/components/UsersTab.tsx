'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControlLabel,
  Switch, Alert, CircularProgress, Chip, InputLabel, FormControl,
  Typography, Stack, Collapse, Divider, useMediaQuery, useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAuth } from '@/context/AuthContext';
import {
  listUsers, createUser, updateUser, deleteUser,
} from '@/api';
import type { User, UserPermission } from '@/types';

export default function UsersTab() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
  const permLabel = (p: string) => {
    switch (p) {
      case 'read_own': return 'Только свои';
      case 'read_all': return 'Чтение всех';
      case 'read_write_all': return 'Полный доступ';
      default: return p;
    }
  };

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

      <Stack spacing={1}>
        {users.map((u) => {
          const editBtn = isAdmin && (
            <IconButton size="small" onClick={(e) => {
              e.stopPropagation();
              setEditingUser(u);
              setForm({
                first_name: u.first_name, last_name: u.last_name, position: u.position,
                login: u.login, password: '', permission: u.permission, instrument_access: u.instrument_access,
              });
              setDialogOpen(true);
            }}>
              <EditIcon fontSize="small" />
            </IconButton>
          );
          const deleteBtn = isAdmin && u.role !== 'admin' && (
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(u.id); }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          );

          if (!isMobile) {
            // Desktop: single row with all info
            return (
              <Paper key={u.id} variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, gap: 2, '&:hover': { bgcolor: '#fafafa' } }}>
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 100 }} noWrap>
                    {u.first_name} {u.last_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100, flexShrink: 0 }} noWrap>
                    {u.position || '—'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 80, flexShrink: 0 }} noWrap>
                    {u.login}
                  </Typography>
                  <Chip label={roleLabel(u.role)} color={u.role === 'admin' ? 'warning' : 'default'} size="small" sx={{ flexShrink: 0 }} />
                  <Chip label={permLabel(u.permission)} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
                  <Chip
                    label={u.instrument_access ? 'Приборы' : 'Без приб.'}
                    color={u.instrument_access ? 'success' : 'default'}
                    size="small" variant="outlined" sx={{ flexShrink: 0 }}
                  />
                  <Box sx={{ flexGrow: 1 }} />
                  {editBtn}
                  {deleteBtn}
                </Box>
              </Paper>
            );
          }

          // Mobile: expandable
          return (
            <Paper key={u.id} variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, cursor: 'pointer', '&:hover': { bgcolor: '#fafafa' } }}
                onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{u.first_name} {u.last_name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>{u.position || u.login}</Typography>
                </Box>
                <Chip label={roleLabel(u.role)} color={u.role === 'admin' ? 'warning' : 'default'} size="small" sx={{ flexShrink: 0, mx: 0.5 }} />
                {editBtn}
                {deleteBtn}
                {expandedId === u.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </Box>
              <Collapse in={expandedId === u.id}>
                <Divider />
                <Box sx={{ px: 1.5, py: 1, bgcolor: '#f9f9f9' }}>
                  <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Логин</Typography>
                      <Typography variant="body2" fontWeight={500}>{u.login}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Доступ</Typography>
                      <Typography variant="body2" fontWeight={500}>{permLabel(u.permission)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Приборы</Typography>
                      <Chip label={u.instrument_access ? 'Да' : 'Нет'} color={u.instrument_access ? 'success' : 'default'} size="small" />
                    </Box>
                  </Stack>
                </Box>
              </Collapse>
            </Paper>
          );
        })}
        {users.length === 0 && (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">Нет пользователей</Typography>
          </Paper>
        )}
      </Stack>

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
