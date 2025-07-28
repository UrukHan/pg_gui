'use client';

import { useEffect, useState } from 'react';
import { Box, Paper, Button, Dialog, DialogActions, DialogContent, DialogTitle, Select, MenuItem, Typography } from '@mui/material';
import Image from 'next/image';
import axios from 'axios';
import TablesManager from '@/components/TablesManager';
import TableEditorDialog from '@/components/TableEditorDialog';
import { Table } from '@/components/types';
import { useSchema } from '@/context/SchemaContext';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL!;
const SCHEMA_URL = `${API_ROOT}/schema`;

export default function Home() {
    const [columns, setColumns] = useState<1 | 2 | 3 | null>(null);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tableToDelete, setTableToDelete] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

    const { schema, reloadSchema } = useSchema();

    useEffect(() => {
        if (!schema.tables.find(table => table.name === tableToDelete)) {
            setTableToDelete('');
        }
    }, [schema, tableToDelete]);

    useEffect(() => {
        setColumns(3);
        reloadSchema();
    }, []);

    if (columns === null) {
        return null;
    }

    const handleCreateTable = () => {
        setCreateDialogOpen(true);
    };

    const handleTableSave = async (updatedTable: Table, renameFrom?: string, renameTo?: string) => {
        setCreateDialogOpen(false);

        const payload = {
            tables: schema.tables.some(t => t.name === renameFrom)
                ? schema.tables.map(tbl => tbl.name === renameFrom ? updatedTable : tbl)
                : [...schema.tables, updatedTable],
            renameFrom: renameFrom || '',
            renameTo: renameTo || '',
        };

        try {
            const res = await axios.post(SCHEMA_URL, payload);
            if (res.status === 200) {
                setMessage({ text: 'Table saved successfully', type: 'success' });
                await reloadSchema(); // обновляем глобально
            } else {
                setMessage({ text: 'Failed to save table', type: 'error' });
            }
        } catch (error: any) {
            setMessage({ text: error.response?.data?.error || 'Error saving table', type: 'error' });
        }
    };

    const handleDeleteTable = async () => {
        if (tableToDelete) {
            try {
                await axios.delete(`${SCHEMA_URL}/${tableToDelete}`);
                setMessage({ text: 'Table deleted successfully', type: 'success' });
                setDeleteDialogOpen(false);
                await reloadSchema(); // обновляем глобально
            } catch (err: any) {
                setMessage({ text: err.response?.data?.error || 'Error deleting table', type: 'error' });
            }
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <Box sx={{ height: '7%', px: 2, bgcolor: 'grey.900', display: 'flex', alignItems: 'center' }}>
                <Box sx={{ position: 'relative', height: '80%', width: 'auto', aspectRatio: '3 / 1' }}>
                    <Image
                        src="/images/logo.png"
                        alt="Logo"
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        style={{ objectFit: 'contain' }}
                    />
                </Box>
            </Box>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '93%' }}>
                <Paper sx={{ height: '5%', display: 'flex', alignItems: 'center', bgcolor: 'grey.300', pt: 2, px: 2, gap: 1 }}>
                    {[1, 2, 3].map(num => (
                        <Button key={num} variant={columns === num ? 'contained' : 'outlined'} onClick={() => setColumns(num as 1 | 2 | 3)}>
                            {num} Column{num > 1 ? 's' : ''}
                        </Button>
                    ))}

                    <Box sx={{ flexGrow: 1 }} />

                    <Typography sx={{ flexGrow: 1, textAlign: 'center', bgcolor: message?.type === 'error' ? 'red' : message?.type === 'success' ? 'green' : '#fff' }}>
                        {message ? message.text : 'Awaiting action...'}
                    </Typography>

                    <Box sx={{ flexGrow: 1 }} />

                    <Button variant="contained" onClick={handleCreateTable}>Create Table</Button>
                    <Button variant="contained" sx={{ bgcolor: 'purple', color: 'white' }} onClick={() => setDeleteDialogOpen(true)}>Delete Table</Button>
                </Paper>

                <Box sx={{ flexGrow: 1, overflow: 'hidden', bgcolor: 'grey.300' }}>
                    <TablesManager
                        key={JSON.stringify(schema)}
                        columns={columns}
                        schema={schema}
                        setMessage={setMessage}
                    />
                </Box>
            </Box>

            <TableEditorDialog
                open={createDialogOpen}
                table={{ name: '', fields: [] }}
                onClose={() => setCreateDialogOpen(false)}
                onSave={handleTableSave}
            />

            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Delete Table</DialogTitle>
                <DialogContent>
                    <Select fullWidth value={tableToDelete} onChange={e => setTableToDelete(e.target.value)}>
                        {schema.tables.map(table => <MenuItem key={table.name} value={table.name}>{table.name}</MenuItem>)}
                    </Select>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button color="error" onClick={handleDeleteTable}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
