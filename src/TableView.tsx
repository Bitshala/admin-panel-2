import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';

// --- INTERFACES ---
interface ApiStudentEntry {
  name: string;
  mail?: string;
  group_id: string;
  ta?: string;
  attendance?: string;
  fa?: number;
  fb?: number;
  fc?: number;
  fd?: number;
  bonus_attempt?: number;
  bonus_answer_quality?: number;
  bonus_follow_up?: number;
  exercise_submitted?: string;
  exercise_test_passing?: string;
  exercise_good_documentation?: string;
  exercise_good_structure?: string;
  week: number;
  total?: number;
}

interface TableRowData {
  id: number;
  name: string;
  email?: string;
  group: string;
  ta: string;
  attendance: boolean;
  gdScore: { fa: number; fb: number; fc: number; fd: number };
  bonusScore: { attempt: number; good: number; followUp: number };
  exerciseScore: { Submitted: boolean; privateTest: boolean; goodStructure: boolean; goodDoc: boolean };
  week?: number;
  total: number;
}

const initialNewStudentFormStateProto: Omit<TableRowData, 'id' | 'total' | 'week' | 'group'> = {
  name: '',
  email: '',
  ta: '',
  attendance: false,
  gdScore: { fa: 0, fb: 0, fc: 0, fd: 0 },
  bonusScore: { attempt: 0, good: 0, followUp: 0 },
  exerciseScore: { Submitted: false, privateTest: false, goodStructure: false, goodDoc: false },
};

// --- COMPONENT ---
const TableView: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [data, setData] = useState<TableRowData[]>([]);
  const [editedRows, setEditedRows] = useState<TableRowData[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaved, SetSaved] = useState(false);
  const [week, setWeek] = useState(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof TableRowData | null; direction: 'ascending' | 'descending' }>({
    key: null,
    direction: 'ascending',
  });
  const [selectedGroup, setSelectedGroup] = useState<string>('All Groups');
  const [selectedTA, setSelectedTA] = useState<string>('All TAs');
  const [attendanceFilter, setAttendanceFilter] = useState<'All' | 'Present' | 'Absent'>('All');
  const [showTableRowForm, setShowTableRowForm] = useState(false);
  const baseGroups = useMemo(() => ['Group 0', 'Group 1', 'Group 2', 'Group 3', 'Group 4', 'Group 5'], []);
  const [newStudent, setNewStudent] = useState<Omit<TableRowData, 'id' | 'total' | 'week'>>({
    ...initialNewStudentFormStateProto,
    group: baseGroups[0] || 'Group 0',
  });
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; targetId: number | null; }>({ visible: false, x: 0, y: 0, targetId: null });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [weeklyData, setWeeklyData] = useState<{ week: number; attended: number; }>({ week: 0, attended: 0 });

  const canEditFields = isEditing && week !== 0;

  // --- DATA COMPUTATION & FETCHING ---
  const computeGdTotal = useCallback((gd: TableRowData['gdScore']): number =>
    (30 / 5) * gd.fa + (30 / 5) * gd.fb + (20 / 5) * gd.fc + (20 / 5) * gd.fd, []);

  const computeBonusTotal = useCallback((b: TableRowData['bonusScore']): number =>
    10 * b.attempt + 10 * b.good + 10 * b.followUp, []);

  const computeExerciseTotal = useCallback((e: TableRowData['exerciseScore']): number =>
    (e.Submitted ? 10 : 0) + (e.privateTest ? 50 : 0) + (e.goodDoc ? 20 : 0) + (e.goodStructure ? 20 : 0), []);

  const computeTotal = useCallback((p: Omit<TableRowData, 'id' | 'total' | 'week'> | TableRowData): number =>
    computeGdTotal(p.gdScore) + computeBonusTotal(p.bonusScore) + computeExerciseTotal(p.exerciseScore),
    [computeGdTotal, computeBonusTotal, computeExerciseTotal]
  );

  const TOKEN  = "token-mpzbqlbbxtjrjyxcwigsexdqadxmgumdizmnpwocfdobjkfdxwhflnhvavplpgyxtsplxisvxalvwgvjwdyvusvalapxeqjdhnsyoyhywcdwucshdoyvefpnobnslqfg";

  const fetchWeeklyData = useCallback((selectedWeek: number) => {
    fetch(`https://admin.bitshala.org/weekly_data/${selectedWeek}`, {
      headers: {
        'Authorization': `${TOKEN}`,
      },
    })
      .then(response => {
        if (!response.ok) {
          return response.text().then(text => {
            let errorDetail = text;
            try { const jsonError = JSON.parse(text); errorDetail = jsonError.message || text; } catch (e) { /* ignore */ }
            throw new Error(`Server error: ${response.status} - ${errorDetail}`);
          });
        }
        return response.json();
      })
      .then((apiData: ApiStudentEntry[]) => {
        const formattedData = apiData.map((person, index) => {
          const gdScore = { fa: person.fa || 0, fb: person.fb || 0, fc: person.fc || 0, fd: person.fd || 0 };
          const bonusScore = { attempt: person.bonus_attempt || 0, good: person.bonus_answer_quality || 0, followUp: person.bonus_follow_up || 0 };
          const exerciseScore = {
            Submitted: person.exercise_submitted === 'yes', privateTest: person.exercise_test_passing === 'yes',
            goodStructure: person.exercise_good_structure === 'yes', goodDoc: person.exercise_good_documentation === 'yes',
          };
          const rowDataShape: Omit<TableRowData, 'id' | 'total'> = {
            name: person.name, email: person.mail, group: person.group_id, ta: person.ta || 'N/A',
            attendance: person.attendance === 'yes', gdScore, bonusScore, exerciseScore, week: selectedWeek,
          };
          const rowData: TableRowData = { id: index + 1, ...rowDataShape, total: computeTotal(rowDataShape) };
          return rowData;
        });
        setData(formattedData);
      })
      .catch(error => { console.error(`Error fetching data for week ${selectedWeek}:`, error); setData([]); });
  }, [computeTotal]);

  const getWeeklyData = useCallback((week: number) => {
    fetch(`https://admin.bitshala.org/attendance/weekly_counts/${week}`)
      .then(res => res.json())
      .then(apiData => {
        if (Array.isArray(apiData)) {
          const currentWeekData = apiData.find(wd => wd.week === week);
          setWeeklyData(currentWeekData || { week: week, attended: 0 });
        } else if (apiData && typeof apiData === 'object' && apiData.week !== undefined) {
          setWeeklyData(apiData);
        } else { setWeeklyData({ week: week, attended: 0 }); }
      })
      .catch(err => { console.error("Error fetching weekly attendance:", err); setWeeklyData({ week: week, attended: 0 }); });
  }, []);

  useEffect(() => { fetchWeeklyData(week); getWeeklyData(week); }, [fetchWeeklyData, getWeeklyData, week]);

  useEffect(() => {
    fetch("https://admin.bitshala.org/students/count")
      .then(res => res.json()).then(data => setTotalCount(data.count))
      .catch(err => console.error("Error fetching total count:", err));
  }, []);

  // --- DATA PROCESSING (SORTING/FILTERING) ---
  const taOptions = useMemo(() => {
    if (!data || data.length === 0) return ['All TAs'];
    const uniqueTAs = new Set(data.map(person => person.ta).filter(ta => ta && ta !== 'N/A'));
    return ['All TAs', ...Array.from(uniqueTAs).sort()];
  }, [data]);

  const processedData = useMemo(() => {
    let filteredData = [...data];
    if (selectedGroup !== 'All Groups') filteredData = filteredData.filter(p => p.group === selectedGroup);
    if (selectedTA !== 'All TAs') filteredData = filteredData.filter(p => p.ta === selectedTA);
    if (attendanceFilter === 'Present') filteredData = filteredData.filter(p => p.attendance === true);
    else if (attendanceFilter === 'Absent') filteredData = filteredData.filter(p => p.attendance === false);
    if (searchTerm) filteredData = filteredData.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (sortConfig.key) {
      filteredData.sort((a, b) => {
        const aValue = a[sortConfig.key!]; const bValue = b[sortConfig.key!];
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          if (aValue.toLowerCase() < bValue.toLowerCase()) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (aValue.toLowerCase() > bValue.toLowerCase()) return sortConfig.direction === 'ascending' ? 1 : -1;
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          return sortConfig.direction === 'ascending' ? (aValue === bValue ? 0 : aValue ? -1 : 1) : (aValue === bValue ? 0 : aValue ? 1 : -1);
        }
        return 0;
      });
    }
    return filteredData;
  }, [data, searchTerm, sortConfig, selectedGroup, selectedTA, attendanceFilter]);

  // --- EVENT HANDLERS ---
  const requestSort = (key: keyof TableRowData) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
  };

  const handleClear = () => {
    setSearchTerm(''); setSelectedGroup('All Groups'); setSelectedTA('All TAs'); setAttendanceFilter('All');
  };

  const handleAttendanceChange = (id: number) => {
    setData(currentData => {
        let updatedRow: TableRowData | null = null;
        const newData = currentData.map(p => {
            if (p.id === id) {
                updatedRow = { ...p, attendance: !p.attendance };
                return updatedRow;
            }
            return p;
        });
        if (updatedRow) {
            setEditedRows(prev => [...prev.filter(r => r.id !== id), updatedRow!]);
        }
        return newData;
    });
    setIsEditing(true);
    SetSaved(false);
  };

  const handleGdScoreChange = (id: number, key: keyof TableRowData['gdScore'], v: string) => {
    setData(currentData => {
        let updatedRow: TableRowData | null = null;
        const newData = currentData.map(p => {
            if (p.id === id) {
                const newGdScore = { ...p.gdScore, [key]: parseInt(v) || 0 };
                updatedRow = { ...p, gdScore: newGdScore, total: computeTotal({ ...p, gdScore: newGdScore }) };
                return updatedRow;
            }
            return p;
        });
        if (updatedRow) {
            setEditedRows(prev => [...prev.filter(r => r.id !== id), updatedRow!]);
        }
        return newData;
    });
    setIsEditing(true);
    SetSaved(false);
  };

  const handleBonusScoreChange = (id: number, key: keyof TableRowData['bonusScore'], v: string) => {
      setData(currentData => {
          let updatedRow: TableRowData | null = null;
          const newData = currentData.map(p => {
              if (p.id === id) {
                  const newBonusScore = { ...p.bonusScore, [key]: parseInt(v) || 0 };
                  updatedRow = { ...p, bonusScore: newBonusScore, total: computeTotal({ ...p, bonusScore: newBonusScore }) };
                  return updatedRow;
              }
              return p;
          });
          if (updatedRow) {
              setEditedRows(prev => [...prev.filter(r => r.id !== id), updatedRow!]);
          }
          return newData;
      });
      setIsEditing(true);
      SetSaved(false);
  };

  const handleExerciseScoreChange = (id: number, key: keyof TableRowData['exerciseScore']) => {
      setData(currentData => {
          let updatedRow: TableRowData | null = null;
          const newData = currentData.map(p => {
              if (p.id === id) {
                  const newExerciseScore = { ...p.exerciseScore, [key]: !p.exerciseScore[key] };
                  updatedRow = { ...p, exerciseScore: newExerciseScore, total: computeTotal({ ...p, exerciseScore: newExerciseScore }) };
                  return updatedRow;
              }
              return p;
          });
          if (updatedRow) {
              setEditedRows(prev => [...prev.filter(r => r.id !== id), updatedRow!]);
          }
          return newData;
      });
      setIsEditing(true);
      SetSaved(false);
  };

  const handleEdit = () => setIsEditing(true);

  const handleSave = () => {
    const payload = editedRows
      .map(p => ({
        name: p.name, mail: p.email, attendance: p.attendance ? 'yes' : 'no', week: p.week ?? week,
        group_id: p.group, ta: p.ta === 'N/A' ? undefined : p.ta, fa: p.gdScore.fa, fb: p.gdScore.fb,
        fc: p.gdScore.fc, fd: p.gdScore.fd, bonus_attempt: p.bonusScore.attempt,
        bonus_answer_quality: p.bonusScore.good, bonus_follow_up: p.bonusScore.followUp,
        exercise_submitted: p.exerciseScore.Submitted ? 'yes' : 'no',
        exercise_test_passing: p.exerciseScore.privateTest ? 'yes' : 'no',
        exercise_good_documentation: p.exerciseScore.goodDoc ? 'yes' : 'no',
        exercise_good_structure: p.exerciseScore.goodStructure ? 'yes' : 'no',
        total: computeTotal(p)
      }));
      console.log(payload,"payload");
    fetch(`https://admin.bitshala.org/weekly_data/${week}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then(r => {
      if (!r.ok) throw new Error(r.statusText);
      setIsEditing(false);
      SetSaved(true);
      
      setEditedRows([]); // Reset edited rows on successful save
      getWeeklyData(week);
      return r.json();
    })
    .catch(e => console.error('Save failed', e));
  };

  const downloadCSV = () => {
    const headers = ["Name", "Email", "Group", "TA", "Attendance", "fa", "fb", "fc", "fd", "Bonus_Attempt", "Bonus_Good", "Bonus_FollowUp", "Submitted", "PrivateTest", "GoodStructure", "GoodDoc", "Total", "Week"];
    const rows = data.map(p => [
      p.name, p.email || '', p.group, p.ta || '', p.attendance ? 'yes' : 'no',
      p.gdScore.fa, p.gdScore.fb, p.gdScore.fc, p.gdScore.fd, p.bonusScore.attempt, p.bonusScore.good, p.bonusScore.followUp,
      p.exerciseScore.Submitted ? 'yes' : 'no', p.exerciseScore.privateTest ? 'yes' : 'no',
      p.exerciseScore.goodStructure ? 'yes' : 'no', p.exerciseScore.goodDoc ? 'yes' : 'no',
      computeTotal(p), p.week ?? week
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `cohort-week-${week}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openAddNewRowForm = () => {
    setNewStudent({ ...initialNewStudentFormStateProto, group: baseGroups[0] || 'Group 0' });
    setShowTableRowForm(true);
  };

  const handleNewStudentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setNewStudent(prev => {
      if (name.startsWith("gdScore.")) { const key = name.split(".")[1] as keyof TableRowData['gdScore']; return { ...prev, gdScore: { ...prev.gdScore, [key]: parseInt(value) || 0 } }; }
      if (name.startsWith("bonusScore.")) { const key = name.split(".")[1] as keyof TableRowData['bonusScore']; return { ...prev, bonusScore: { ...prev.bonusScore, [key]: parseInt(value) || 0 } }; }
      if (name.startsWith("exerciseScore.")) { const key = name.split(".")[1] as keyof TableRowData['exerciseScore']; return { ...prev, exerciseScore: { ...prev.exerciseScore, [key]: checked } }; }
      return { ...prev, [name]: type === 'checkbox' ? checked : value };
    });
  };

  const handleConfirmAddStudent = () => {
    if (!newStudent.name.trim()) { alert("Student name is required."); return; }

    const payload = {
        name: newStudent.name, mail: newStudent.email, attendance: newStudent.attendance ? 'yes' : 'no', week: week ?? week,
        group_id: newStudent.group, ta: newStudent.ta === 'N/A' ? undefined : newStudent.ta, fa: newStudent.gdScore.fa, fb: newStudent.gdScore.fb,
        fc: newStudent.gdScore.fc, fd: newStudent.gdScore.fd, bonus_attempt: newStudent.bonusScore.attempt,
        bonus_answer_quality: newStudent.bonusScore.good, bonus_follow_up: newStudent.bonusScore.followUp,
        exercise_submitted: newStudent.exerciseScore.Submitted ? 'yes' : 'no',
        exercise_test_passing: newStudent.exerciseScore.privateTest ? 'yes' : 'no',
        exercise_good_documentation: newStudent.exerciseScore.goodDoc ? 'yes' : 'no',
        exercise_good_structure: newStudent.exerciseScore.goodStructure ? 'yes' : 'no',
        total: computeTotal(newStudent)
    }
    console.log(payload,"payload")
    fetch(`https://admin.bitshala.org/weekly_data/${week}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
    })
    .then(r => {
      if (!r.ok) throw new Error(r.statusText);
      setIsEditing(false);
      SetSaved(true);
      getWeeklyData(week);
      return r.json();
    })
    .catch(e => console.error('Save failed', e));
  };

  const handleDeleteRow = () => {
    if (contextMenu.targetId === null) return;
    const rowToDelete = data.find(p => p.id === contextMenu.targetId);
    if (!rowToDelete) {
      console.error("Could not find row to delete in frontend state.");
      setContextMenu({ visible: false, x: 0, y: 0, targetId: null });
      return;
    }
    const payload = {
        name: rowToDelete.name, mail: rowToDelete.email, week: rowToDelete.week ?? week, group_id: rowToDelete.group,
        ta: rowToDelete.ta === 'N/A' ? undefined : rowToDelete.ta, attendance: rowToDelete.attendance ? 'yes' : 'no',
        fa: rowToDelete.gdScore.fa, fb: rowToDelete.gdScore.fb, fc: rowToDelete.gdScore.fc, fd: rowToDelete.gdScore.fd,
        bonus_attempt: rowToDelete.bonusScore.attempt, bonus_answer_quality: rowToDelete.bonusScore.good,
        bonus_follow_up: rowToDelete.bonusScore.followUp,
        exercise_submitted: rowToDelete.exerciseScore.Submitted ? 'yes' : 'no',
        exercise_test_passing: rowToDelete.exerciseScore.privateTest ? 'yes' : 'no',
        exercise_good_documentation: rowToDelete.exerciseScore.goodDoc ? 'yes' : 'no',
        exercise_good_structure: rowToDelete.exerciseScore.goodStructure ? 'yes' : 'no',
        total: computeTotal(rowToDelete)
    };
    fetch(`https://admin.bitshala.org/del/${week}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then(response => {
      if (!response.ok) { return response.text().then(text => { throw new Error(text || response.statusText) }); }
      setData(prevData => prevData.filter(p => p.id !== contextMenu.targetId));
      getWeeklyData(week);
    })
    .catch(e => console.error('Delete failed:', e))
    .finally(() => setContextMenu({ visible: false, x: 0, y: 0, targetId: null }));
  };

  const handleNameRightClick = (event: React.MouseEvent<HTMLTableCellElement>, personId: number) => {
    event.preventDefault();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, targetId: personId });
  };

  useEffect(() => {
    const handleClickOutsideContextMenu = (event: MouseEvent) => {
      if (contextMenu.visible && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, targetId: null });
      }
    };
    const handleEscKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && contextMenu.visible) {
            setContextMenu({ visible: false, x: 0, y: 0, targetId: null });
        }
    };
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutsideContextMenu);
      document.addEventListener('keydown', handleEscKey);
    }
    return () => {
      document.removeEventListener('click', handleClickOutsideContextMenu);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [contextMenu.visible]);

  const getSortIndicator = (key: keyof TableRowData) => (sortConfig.key === key ? (sortConfig.direction === 'ascending' ? ' 🔼' : ' 🔽') : '');
  const scoreOptions = [0, 1, 2, 3, 4, 5];

  // --- RENDER ---
  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen font-sans">
      {showTableRowForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white border-gray-300 text-gray-800 rounded-lg shadow-xl flex flex-col w-full max-w-2xl max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="text-xl font-semibold">Add New Student (Week {week})</h3>
              <button className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1" onClick={() => setShowTableRowForm(false)} aria-label="Close">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Form fields */}
              <div>
                <label htmlFor="form-name" className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                <input type="text" name="name" id="form-name" value={newStudent.name} onChange={handleNewStudentChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
              </div>
              <div>
                <label htmlFor="form-email" className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" name="email" id="form-email" value={newStudent.email} onChange={handleNewStudentChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
              </div>
              <div>
                <label htmlFor="form-group" className="block text-sm font-medium text-gray-700">Group</label>
                <select name="group" id="form-group" value={newStudent.group} onChange={handleNewStudentChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                  {baseGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="form-ta" className="block text-sm font-medium text-gray-700">TA</label>
                <input type="text" name="ta" id="form-ta" value={newStudent.ta} onChange={handleNewStudentChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
              </div>
              <div className="flex items-center">
                <input type="checkbox" name="attendance" id="form-attendance" checked={newStudent.attendance} onChange={handleNewStudentChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/>
                <label htmlFor="form-attendance" className="ml-2 block text-sm text-gray-900">Attended This Week</label>
              </div>
              <fieldset className="border p-4 rounded-md">
                <legend className="text-sm font-medium text-gray-700 px-1">GD Scores</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
                  {(['fa', 'fb', 'fc', 'fd'] as const).map(key => (<div key={key}><label htmlFor={`form-gdScore.${key}`} className="block text-xs font-medium text-gray-600 capitalize">{key.replace('f','Factor ')}</label><select name={`gdScore.${key}`} id={`form-gdScore.${key}`} value={newStudent.gdScore[key]} onChange={handleNewStudentChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">{scoreOptions.map(val => <option key={val} value={val}>{val === 0 ? '-' : val}</option>)}</select></div>))}
                </div>
              </fieldset>
              <fieldset className="border p-4 rounded-md">
                <legend className="text-sm font-medium text-gray-700 px-1">Bonus Scores</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                  {(['attempt', 'good', 'followUp'] as const).map(key => (<div key={key}><label htmlFor={`form-bonusScore.${key}`} className="block text-xs font-medium text-gray-600 capitalize">{key}</label><select name={`bonusScore.${key}`} id={`form-bonusScore.${key}`} value={newStudent.bonusScore[key]} onChange={handleNewStudentChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">{scoreOptions.map(val => <option key={val} value={val}>{val === 0 ? '-' : val}</option>)}</select></div>))}
                </div>
              </fieldset>
              <fieldset className="border p-4 rounded-md">
                <legend className="text-sm font-medium text-gray-700 px-1">Exercise Scores</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-2">
                  {(Object.keys(newStudent.exerciseScore) as Array<keyof TableRowData['exerciseScore']>).map(key => (<div key={key} className="flex items-center"><input type="checkbox" name={`exerciseScore.${key}`} id={`form-exerciseScore.${key}`} checked={newStudent.exerciseScore[key]} onChange={handleNewStudentChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/><label htmlFor={`form-exerciseScore.${key}`} className="ml-2 block text-sm text-gray-900 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</label></div>))}
                </div>
              </fieldset>
            </div>
            <div className="flex justify-end items-center p-4 border-t border-gray-200 space-x-3">
              <button type="button" onClick={() => setShowTableRowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Cancel</button>
              <button type="button" onClick={handleConfirmAddStudent} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Add Student</button>
            </div>
          </div>
        </div>
      )}

      {contextMenu.visible && (
        <div ref={contextMenuRef} style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed z-[1000] bg-white border border-gray-300 rounded-md shadow-lg py-1 w-40">
          <ul>
            <li><button onClick={handleDeleteRow} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-500 hover:text-white">Delete Row</button></li>
          </ul>
        </div>
      )}

      <div className="max-w-full mx-auto">
        <h1>Learning Bitcoin From Command Line</h1>
        <h2 className='font-light'>30th May - 27th july</h2>
        <h2 className='font-light'>Github Classroom Master Repository</h2>
        <h3 className="">Cohort Participants</h3>

        <div className='flex gap-4 mb-4 items-center'>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <button key={i} onClick={() => { setWeek(i); fetchWeeklyData(i); SetSaved(false); setIsEditing(false); setContextMenu({visible: false, x: 0, y: 0, targetId: null}); setEditedRows([]); }}
              className={`font-light text-xl pb-1 ${week === i ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-600 hover:text-indigo-500'}`}>
              Week {i}
            </button>
          ))}
        </div>
        
        <div className="mb-4 flex flex-wrap gap-4 items-center">
          <input type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 flex-grow sm:flex-grow-0 sm:w-auto"/>
          <select id="groupFilter" value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
            {['All Groups', ...baseGroups].map(groupName => <option key={groupName} value={groupName}>{groupName}</option>)}
          </select>
          <select id="taFilter" value={selectedTA} onChange={(e) => setSelectedTA(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
            {taOptions.map(taName => <option key={taName} value={taName}>{taName}</option>)}
          </select>
          <select id="attendanceFilter" value={attendanceFilter} onChange={e => setAttendanceFilter(e.target.value as 'All' | 'Present' | 'Absent')} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
            <option value="All">All Attendance</option><option value="Present">Present</option><option value="Absent">Absent</option>
          </select>
          <button onClick={handleClear} className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-md">Clear Filters</button>
        </div>

        <div className="flex justify-between items-center gap-2 mb-4 mt-8">
          <div className='flex gap-8 text-2xl '>
            <div>Total Participants: {totalCount ?? '...'}</div>
            <div>Attendes: {weeklyData.attended ?? 0}</div>
            <div>Absentes: {(totalCount && weeklyData.attended !== undefined) ? (totalCount - weeklyData.attended) : '...'}</div>
          </div>
          <div className='flex gap-2'>
            <button onClick={openAddNewRowForm} className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600">Add New Row</button>
            <button onClick={handleEdit} disabled={isEditing} className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50">Edit</button>
            <button onClick={handleSave} disabled={!isEditing} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">Save</button>
            <button onClick={downloadCSV} disabled={!isSaved} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50">Download CSV</button>
          </div>
        </div>

        <div className="shadow-lg rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" rowSpan={2} className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider align-middle cursor-pointer hover:bg-gray-200" onClick={() => requestSort('name')}>Name{getSortIndicator('name')}</th>
                  <th scope="col" rowSpan={2} className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider align-middle hidden sm:table-cell">Email</th>
                  {week > 0 && <th scope="col" rowSpan={2} className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider hidden sm:table-cell align-middle cursor-pointer hover:bg-gray-200" onClick={() => requestSort('group')}>Group{getSortIndicator('group')}</th>}
                  <th scope="col" rowSpan={2} className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider hidden md:table-cell align-middle">TA</th>
                  <th scope="col" rowSpan={2} className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider hidden lg:table-cell align-middle">Attendance</th>
                  <th scope="col" colSpan={4} className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">GD SCORE</th>
                  <th scope="col" colSpan={3} className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">BONUS SCORE</th>
                  <th scope="col" colSpan={4} className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">EXERCISE SCORES</th>
                  <th scope="col" rowSpan={2} className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider align-middle cursor-pointer hover:bg-gray-200" onClick={() => requestSort('total')}>
                    Total{getSortIndicator('total')}
                  </th>
                </tr>
                <tr className="bg-gray-100">
                  <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Communication</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Depth Of Answer</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Technical Bitcoin Fluency</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Engagement</th>
                  <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Attempt</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Good</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Follow Up</th>
                  <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Submitted</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Github Test</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Good Structure</th><th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Good doc</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedData.map((person) => (
                  <tr key={person.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap cursor-default" onContextMenu={(e) => handleNameRightClick(e, person.id)}>
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-medium">
                            {person.name.charAt(0)}{(person.name.split(' ')[1]?.charAt(0) || '').toUpperCase()}
                          </div>
                        </div>
                        <div className="ml-4"><div className="text-sm font-medium text-gray-900">{person.name}</div></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell"><div className="text-sm text-gray-900">{person.email || '-'}</div></td>
                    {week > 0 && <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell"><div className="text-sm text-gray-900">{person.group}</div></td>}
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell"><div className="text-sm text-gray-500">{person.ta || '-'}</div></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                        <input type="checkbox" checked={person.attendance} disabled={!isEditing} onChange={() => handleAttendanceChange(person.id)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"/>
                    </td>
                    {(['fa', 'fb', 'fc', 'fd'] as const).map(key => (<td key={key} className="px-3 py-4 whitespace-nowrap text-center text-sm"><select value={person.gdScore[key]} disabled={!canEditFields} onChange={e => handleGdScoreChange(person.id, key, e.target.value)} className="border border-gray-300 rounded-md shadow-sm p-1 text-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100">{scoreOptions.map(val => (<option key={val} value={val}>{val === 0 ? '-' : val}</option>))}</select></td>))}
                    {(['attempt', 'good', 'followUp'] as const).map(key => (<td key={key} className="px-3 py-4 whitespace-nowrap text-center text-sm"><select value={person.bonusScore[key]} disabled={!canEditFields} onChange={e => handleBonusScoreChange(person.id, key, e.target.value)} className="border border-gray-300 rounded-md shadow-sm p-1 text-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100">{scoreOptions.map(val => (<option key={val} value={val}>{val === 0 ? '-' : val}</option>))}</select></td>))}
                    {(['Submitted', 'privateTest', 'goodStructure', 'goodDoc'] as const).map(key => (<td key={key} className="px-3 py-4 whitespace-nowrap text-center text-sm"><input type="checkbox" checked={person.exerciseScore[key]}  onChange={() => handleExerciseScoreChange(person.id, key)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"/></td>))}
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-700">{isEditing ? computeTotal(person) : person.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
           {processedData.length === 0 && (<div className="text-center py-10 text-gray-500">No data available {searchTerm || selectedGroup !== 'All Groups' || selectedTA !== 'All TAs' || attendanceFilter !== 'All' ? 'for your current filters' : ''}.</div>)}
           {processedData.length > 0 && (<div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6"><div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between"><div><p className="text-sm text-gray-700">Showing <span className="font-medium">1</span> to <span className="font-medium">{Math.min(10, processedData.length)}</span> of{' '}<span className="font-medium">{processedData.length}</span> results</p></div></div></div>)}
        </div>
      </div>
    </div>
  );
};

export default TableView;
