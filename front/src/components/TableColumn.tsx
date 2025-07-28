'use client';

import { useEffect, useState } from 'react';
import {
    Box, Select, MenuItem, Button, Typography,
    Paper, Pagination, IconButton
} from '@mui/material';
import axios from 'axios';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddRowDialog from './AddRowDialog';
import EditRowDialog from './EditRowDialog';
import TableEditorDialog from './TableEditorDialog';
import { useSchema } from '@/context/SchemaContext';
import { Schema, Table as TableType } from './types';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL!;
const SCHEMA_URL = `${API_ROOT}/schema`;
const rowsPerPage = parseInt(process.env.NEXT_PUBLIC_ROWS_PER_PAGE || '20');

interface TableColumnProps {
    initialTable?: TableType | null;
    setMessage: React.Dispatch<React.SetStateAction<{ text: string; type: 'error' | 'success' } | null>>;
}

export default function TableColumn({ initialTable, setMessage }: TableColumnProps) {
    const { schema, reloadSchema } = useSchema();

    const [selectedTable, setSelectedTable] = useState<TableType | null>(initialTable || null);
    const [tableRows, setTableRows] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingRowData, setEditingRowData] = useState<any>(null);
    const [editTableOpen, setEditTableOpen] = useState(false);
    const [editingTable, setEditingTable] = useState<TableType | null>(null);

    useEffect(() => {
        if (!initialTable && schema.tables.length > 0) {
            setSelectedTable(schema.tables[0]);
        } else if (initialTable) {
            setSelectedTable(initialTable);
        }
    }, [initialTable, schema]);

    useEffect(() => {
        if (selectedTable) refreshTableData();
    }, [selectedTable]);

    const handleAddRow = () => {
        setAddDialogOpen(true);
    };

    const handleEditRow = (rowIndex: number) => {
        setEditingRowData(tableRows[rowIndex]);
        setEditDialogOpen(true);
    };

    const handleDeleteRow = (rowId: number | null | undefined) => {
        if (!selectedTable || !rowId || rowId === null) {
            setMessage({ text: 'Ошибка удаления: некорректный идентификатор.', type: 'error' });
            return;
        }

        axios.delete(`${SCHEMA_URL}/${selectedTable.name}/${rowId}`)
            .then(() => {
                refreshTableData();
                setMessage({ text: 'Row deleted successfully.', type: 'success' });
            })
            .catch(err => {
                setMessage({ text: err.response?.data?.error || 'Ошибка при удалении данных.', type: 'error' });
            });
    };

    const handleCreateRow = (rowData: any) => {
        if (!selectedTable) {
            setMessage({ text: 'Таблица не выбрана.', type: 'error' });
            return;
        }

        for (const field of selectedTable.fields) {
            if (field.name === 'id') continue; // пропускаем id

            const value = rowData[field.name]?.toString().trim();

            if (field.type === 'int' || field.type === 'uint') {
                if (!/^-?\d+$/.test(value)) {
                    setMessage({
                        text: `Переменная неверного типа: вы ввели "${value}", а поле "${field.name}" поддерживает целое число.`,
                        type: 'error',
                    });
                    return;
                }
            } else if (field.type === 'float') {
                if (!/^-?\d+(\.\d+)?$/.test(value)) {
                    setMessage({
                        text: `Переменная неверного типа: вы ввели "${value}", а поле "${field.name}" поддерживает дробное число.`,
                        type: 'error',
                    });
                    return;
                }
            } else if (field.type === 'bool') {
                if (!(value === 'true' || value === 'false')) {
                    setMessage({
                        text: `Переменная неверного типа: вы ввели "${value}", а поле "${field.name}" поддерживает логический тип (true или false).`,
                        type: 'error',
                    });
                    return;
                }
            }
        }

        axios.post(`${SCHEMA_URL}/${selectedTable.name}`, rowData)
            .then(() => {
                setAddDialogOpen(false);
                refreshTableData();
                setMessage({ text: 'Row added successfully.', type: 'success' });
            })
            .catch(err => {
                setMessage({ text: err.response?.data?.error || 'Ошибка при добавлении строки.', type: 'error' });
            });
    };

    const handleUpdateRow = (rowData: any) => {
        if (!selectedTable || !rowData.id) {
            setMessage({ text: 'Ошибка обновления: нет ID.', type: 'error' });
            return;
        }

        for (const field of selectedTable.fields) {
            const value = rowData[field.name]?.toString().trim();

            if (field.type === 'int' || field.type === 'uint') {
                if (!/^-?\d+$/.test(value)) {
                    setMessage({
                        text: `Переменная неверного типа: вы ввели "${value}", а поле "${field.name}" поддерживает целое число.`,
                        type: 'error',
                    });
                    return;
                }
            } else if (field.type === 'float') {
                if (!/^-?\d+(\.\d+)?$/.test(value)) {
                    setMessage({
                        text: `Переменная неверного типа: вы ввели "${value}", а поле "${field.name}" поддерживает дробное число.`,
                        type: 'error',
                    });
                    return;
                }
            } else if (field.type === 'bool') {
                if (!(value === 'true' || value === 'false')) {
                    setMessage({
                        text: `Переменная неверного типа: вы ввели "${value}", а поле "${field.name}" поддерживает логический тип (true или false).`,
                        type: 'error',
                    });
                    return;
                }
            }
        }

        console.log(`Sending PUT request to ${SCHEMA_URL}/${selectedTable.name}/${rowData.id} with data:`, rowData);

        axios.put(`${SCHEMA_URL}/${selectedTable.name}/${rowData.id}`, rowData)
            .then(() => {
                setEditDialogOpen(false);
                refreshTableData();
                setMessage({ text: 'Row updated successfully.', type: 'success' });
            })
            .catch(err => {
                setMessage({ text: err.response?.data?.error || 'Ошибка при обновлении строки.', type: 'error' });
            });
    };

    const refreshTableData = () => {
        if (!selectedTable) return;
        axios.get(`${SCHEMA_URL}/${selectedTable.name}`).then(res => {
            setTableRows(res.data.rows || []);
        });
    };

    const handleEditTable = () => {
        if (selectedTable) {
            setEditingTable(selectedTable);
            setEditTableOpen(true);
        }
    };

    const handleUpdateTable = async (updatedTable: TableType, renameFrom?: string, renameTo?: string) => {
        const payload = {
            tables: schema.tables.map(t => t.name === (renameFrom || updatedTable.name) ? updatedTable : t),
            renameFrom: renameFrom || '',
            renameTo: renameTo || '',
        };

        console.log("Payload отправляется на бек при редактировании таблицы:", payload);

        try {
            await axios.post(SCHEMA_URL, payload);
            await reloadSchema();
            setSelectedTable(updatedTable);
            setEditTableOpen(false);
            console.log("Таблица успешно обновлена, схема перезагружена.");
        } catch (err) {
            console.error('Ошибка при обновлении таблицы:', err);
        }
    };


    return (
        <Paper sx={{ display: 'flex', flexDirection: 'column', width: '99%', height: '100%', overflow: 'hidden', bgcolor: 'grey.150' }}>
            <Box sx={{ display: 'flex', gap: 1, height: '8%', alignItems: 'center', p: 1 }}>
                <Select
                    fullWidth
                    value={schema.tables.some(t => t.name === selectedTable?.name) ? selectedTable?.name || '' : ''}
                    onChange={e => {
                        const table = schema.tables.find(t => t.name === e.target.value);
                        setSelectedTable(table || null);
                        setPage(1);
                    }}
                    size="small"
                >
                    {schema.tables.map(table => (
                        <MenuItem key={table.name} value={table.name}>{table.name}</MenuItem>
                    ))}
                </Select>
                <Button variant="outlined" size="small" onClick={handleEditTable}>Edit</Button>
            </Box>

            {selectedTable ? (
                <Box sx={{ height: '92%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <Box sx={{ display: 'flex', height: '5%', alignItems: 'center', borderBottom: '2px solid #ccc' }}>
                        {selectedTable.fields.filter(f => f.name !== 'id').map(f => (
                            <Box key={f.name} sx={{ flex: 1, px: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                {f.name}
                            </Box>
                        ))}
                        <Box sx={{ width: '60px' }} />
                    </Box>

                    <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                        {tableRows.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((row, index) => (
                            <Box key={row.id ?? `temp-${index}`} sx={{ display: 'flex', color: 'gray',height: `calc(95% / ${rowsPerPage})`, borderBottom: '1px solid #ccc', alignItems: 'center' }}>

                            {selectedTable.fields.filter(f => f.name !== 'id').map(f => (
                                    <Box key={f.name} sx={{ flex: 1, px: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                        {row[f.name]}
                                    </Box>
                                ))}
                                <IconButton  sx={{ color: 'green' }} size="small" onClick={() => handleEditRow(tableRows.indexOf(row))}>
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDeleteRow(row.id)}>
                                    <DeleteIcon sx={{ color: 'purple' }} fontSize="small" color="error" />
                                </IconButton>
                            </Box>
                        ))}
                    </Box>

                    <Box sx={{ height: '5%', px: 5, display: 'flex', justifyContent: 'center', borderBottom: '1px solid #ccc' }}>
                        <Button variant="outlined" size="small" fullWidth onClick={handleAddRow} >
                            Add Row
                        </Button>
                    </Box>

                    <Box sx={{ height: '5%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <Pagination
                            count={Math.ceil(tableRows.length / rowsPerPage)}
                            page={page}
                            onChange={(_, p) => setPage(p)}
                            size="small"
                        />
                    </Box>

                    <AddRowDialog
                        open={addDialogOpen}
                        fields={selectedTable.fields}
                        onClose={() => setAddDialogOpen(false)}
                        onSave={handleCreateRow}
                    />

                    <EditRowDialog
                        open={editDialogOpen}
                        data={editingRowData}
                        fields={selectedTable.fields}
                        onClose={() => setEditDialogOpen(false)}
                        onSave={handleUpdateRow}
                    />
                    {editingTable && (
                        <TableEditorDialog open={editTableOpen} table={editingTable} onClose={() => setEditTableOpen(false)} onSave={handleUpdateTable} />
                    )}
                </Box>
            ) : (
                <Typography>Select or create a table</Typography>
            )}
        </Paper>
    );

}
