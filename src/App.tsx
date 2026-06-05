import React, { useState, useEffect } from 'react';
import { Home, PlusCircle, History, ChevronLeft, ChevronRight, Tag, Mail, Edit2, Trash2, CalendarDays, FileText, PieChart, Settings, Download, Upload, X, LogOut, Users, BookPlus, Search, PiggyBank, ListTodo, Target, Trophy, Clock, CheckCircle2, Circle } from 'lucide-react';
import { useRef } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { addDays, format, isSameDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db as firestoreDb, signInWithGoogle, logout } from './firebase';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, arrayUnion, serverTimestamp, deleteDoc, orderBy, getDocs, getDoc, deleteField, writeBatch } from 'firebase/firestore';

ChartJS.register(ArcElement, Tooltip, Legend);

type TransactionType = 'pengeluaran' | 'pemasukan';
type UserType = 'Suami' | 'Istri';

interface Transaction {
  id: string;
  date: string;
  amt: number;
  desc: string;
  cat: string;
  type: TransactionType;
  user: UserType;
  paymentMethod?: 'tunai' | 'kredit';
  isPaid?: boolean;
}

interface Plan {
  id: string;
  name: string;
  cost: number;
  date: string;
  status: 'planned' | 'done';
}

interface SavingsGoal {
  id: string;
  name: string;
  targetAmt: number;
  currentAmt: number;
  deadline: string;
}

const catStyles: Record<string, string> = {
  'Makanan': '#f472b6', 
  'Belanja': '#38bdf8', 
  'Transport': '#818cf8', 
  'Gaji': '#34d399', 
  'Lainnya': '#fbbf24',
  'Elektronik': '#fb923c',
  'Mobil': '#c084fc',
  'Membelai': '#2dd4bf',
  'Kecantikan': '#a78bfa'
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');
  const [joinLedgerId, setJoinLedgerId] = useState('');

  const [activePage, setActivePage] = useState<'home' | 'report' | 'add' | 'stats' | 'history' | 'plans' | 'savings' | 'credits'>('home');
  const [db, setDb] = useState<Transaction[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [showSplash, setShowSplash] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(5000000);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<{show: boolean, type: 'success'|'error'|'confirm', msg: string, data: Transaction[]}>({show: false, type: 'success', msg: '', data: []});
  const [toast, setToast] = useState<{show: boolean, msg: string}>({show: false, msg: ''});
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [showAddSavingsAmtModal, setShowAddSavingsAmtModal] = useState<{show: boolean, goalId: string | null}>({show: false, goalId: null});

  // Plan Input State
  const [planInput, setPlanInput] = useState({ name: '', cost: '', date: format(new Date(), 'yyyy-MM-dd') });
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // Savings Input State
  const [savingsInput, setSavingsInput] = useState({ name: '', targetAmt: '', deadline: '' });
  const [addSavingsAmt, setAddSavingsAmt] = useState('');

  const [reportTime, setReportTime] = useState<'ini' | 'lalu'>('ini');
  const [statsViewType, setStatsViewType] = useState<'bulan' | 'tahun'>('bulan');
  const [statsTime, setStatsTime] = useState<'ini' | 'lalu'>('ini');

  // Input state
  const [inputType, setInputType] = useState<TransactionType>('pengeluaran');
  const [inputUser, setInputUser] = useState<UserType>('Suami');
  const [inputDate, setInputDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [inputCat, setInputCat] = useState<string>('Makanan');
  const [inputAmt, setInputAmt] = useState<string>('');
  const [inputDesc, setInputDesc] = useState<string>('');
  const [inputPaymentMethod, setInputPaymentMethod] = useState<'tunai' | 'kredit'>('tunai');
  const [inputIsPaid, setInputIsPaid] = useState<boolean>(false);
  const [creditFilter, setCreditFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthChecking(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    // Splash screen timer
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(firestoreDb, 'ledgers'), where('memberIds', 'array-contains', user.uid));
      const unsub = onSnapshot(q, snap => {
        const lgs = snap.docs.map(d => ({id: d.id, ...d.data()}));
        setLedgers(lgs);
        if (lgs.length > 0) {
          // Hanya auto-select jika lgs length === 1 dan sebelumnya null (first load)
          if (!selectedLedgerId && lgs.length === 1) {
            setSelectedLedgerId(lgs[0].id);
          } else if (selectedLedgerId && !lgs.find(l => l.id === selectedLedgerId)) {
            // Jika ledger yang dipilih sudah tidak ada (misal dihapus atau kick)
            setSelectedLedgerId(null);
          }
        } else {
          setSelectedLedgerId(null);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'ledgers');
      });
      return unsub;
    }
  }, [user, selectedLedgerId]);

  useEffect(() => {
    if (user && selectedLedgerId) {
      const q = query(collection(firestoreDb, `ledgers/${selectedLedgerId}/transactions`), orderBy('date', 'desc'));
      const unsub = onSnapshot(q, snap => {
        setDb(snap.docs.map(d => ({id: d.id, ...d.data()} as Transaction)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `ledgers/${selectedLedgerId}/transactions`);
      });
      return unsub;
    } else {
      setDb([]);
    }
  }, [user, selectedLedgerId]);

  useEffect(() => {
    if (user && selectedLedgerId) {
      const q = query(collection(firestoreDb, `ledgers/${selectedLedgerId}/plans`), orderBy('date', 'asc'));
      const unsub = onSnapshot(q, snap => {
        setPlans(snap.docs.map(d => ({id: d.id, ...d.data()} as Plan)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `ledgers/${selectedLedgerId}/plans`);
      });
      return unsub;
    } else {
      setPlans([]);
    }
  }, [user, selectedLedgerId]);

  useEffect(() => {
    if (user && selectedLedgerId) {
      const q = query(collection(firestoreDb, `ledgers/${selectedLedgerId}/savings_goals`), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, snap => {
        setSavingsGoals(snap.docs.map(d => ({id: d.id, ...d.data()} as SavingsGoal)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `ledgers/${selectedLedgerId}/savings_goals`);
      });
      return unsub;
    } else {
      setSavingsGoals([]);
    }
  }, [user, selectedLedgerId]);

  useEffect(() => {
    if (selectedLedgerId && ledgers.length > 0) {
      const lg = ledgers.find(l => l.id === selectedLedgerId);
      if (lg && lg.monthlyBudget) {
        setMonthlyBudget(lg.monthlyBudget);
      }
    }
  }, [selectedLedgerId, ledgers]);

  const saveBudget = async (b: number) => {
    setMonthlyBudget(b);
    if (selectedLedgerId) {
      await updateDoc(doc(firestoreDb, 'ledgers', selectedLedgerId), { monthlyBudget: b });
    }
  };

  const handleSaveBudget = () => {
    const b = parseInt(tempBudget.replace(/\D/g, ''), 10);
    if (!isNaN(b)) {
      saveBudget(b);
    }
    setIsEditingBudget(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportCSV = () => {
    const header = ['ID', 'Tanggal', 'Jumlah', 'Deskripsi', 'Kategori', 'Tipe', 'User', 'Metode Bayar', 'Status Bayar'];
    const rows = db.map(t => [t.id, t.date, t.amt, `"${t.desc.replace(/"/g, '""')}"`, `"${t.cat}"`, t.type, t.user, t.paymentMethod || '', t.isPaid ? 'Lunas' : (t.paymentMethod === 'kredit' ? 'Belum' : '')]);
    const csvContent = header.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Data_FinancialKita_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
           if (fileInputRef.current) fileInputRef.current.value = '';
           return;
        }
        
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) {
           if (fileInputRef.current) fileInputRef.current.value = '';
           return;
        }

        const newDb: Transaction[] = [];
        let skipped = 0;

        const firstLineText = lines[0].toLowerCase();
        const isStandardFormat = firstLineText.includes('tanggal') && firstLineText.includes('jumlah') && firstLineText.includes('kategori');
        const rowsToProcess = isStandardFormat ? lines.slice(1) : lines;

        let currentType: TransactionType = 'pemasukan';
        let currentYear = new Date().getFullYear();

        for (const row of rowsToProcess) {
          if (!row.trim()) continue;
          let cols;
          if (row.includes('\t')) {
              cols = row.split('\t');
          } else {
              cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
              if (cols.length < 2) {
                  cols = row.split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/);
              }
          }
          
          const parsedCols = cols.map(col => {
              let c = col.trim();
              if (c.startsWith('"') && c.endsWith('"')) {
                  c = c.substring(1, c.length - 1).replace(/""/g, '"');
              }
              return c;
          });

          if (isStandardFormat) {
            if (parsedCols.length >= 6) {
              let cIdx = parsedCols.length === 6 ? -1 : 0; // offset if ID is missing
              
              const idStr = cIdx === 0 ? parsedCols[0].trim() : '';
              const id = idStr || Date.now().toString() + Math.random().toString(36).substring(2, 9);
              
              let dateStr = parsedCols[cIdx + 1]?.trim() || '';
              if (dateStr.includes('/')) {
                 const parts = dateStr.split('/');
                 // Assume DD/MM/YYYY
                 if (parts.length === 3 && parts[2].length === 4) {
                     dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                 }
              }
              const date = dateStr;
              
              const rawAmt = parsedCols[cIdx + 2]?.replace(/[^0-9-]/g, '') || '';
              const amt = parseInt(rawAmt, 10);
              
              const desc = parsedCols[cIdx + 3]?.trim() || '';
              const cat = parsedCols[cIdx + 4]?.trim() || '';
              
              let typeStr = parsedCols[cIdx + 5]?.trim().toLowerCase() || '';
              const type = (typeStr === 'pemasukan' || typeStr === 'pengeluaran') ? typeStr as TransactionType : null;
              
              let userStr = parsedCols[cIdx + 6]?.trim().toLowerCase();
              const user = (userStr === 'suami' ? 'Suami' : userStr === 'istri' ? 'Istri' : null) as UserType | null;

              let payStr = parsedCols[cIdx + 7]?.trim().toLowerCase() || '';
              const paymentMethod = (type === 'pengeluaran' && (payStr === 'kredit' || payStr === 'tunai')) ? payStr as 'tunai' | 'kredit' : undefined;

              let payStatusStr = parsedCols[cIdx + 8]?.trim().toLowerCase() || '';
              const isPaid = (type === 'pengeluaran' && paymentMethod === 'kredit') ? 
                (payStatusStr === 'lunas' || payStatusStr === 'true' || payStatusStr === 'paid' || payStatusStr === 'sudah' || payStatusStr === 'yes' || payStatusStr === 'y') : 
                false;

              if (date && !isNaN(amt) && desc && cat && type && user) {
                 const newTx: any = { id, date, amt, desc, cat, type, user };
                 if (paymentMethod) {
                   newTx.paymentMethod = paymentMethod;
                   if (paymentMethod === 'kredit') {
                     newTx.isPaid = isPaid;
                   }
                 }
                 newDb.push(newTx);
              } else {
                 skipped++;
              }
            } else {
               skipped++;
            }
          } else {
            // Heuristic format (e.g. copied from sheets)
            const rowText = parsedCols.join(' ').toLowerCase();
            
            if (rowText.includes('masuk')) currentType = 'pemasukan';
            if (rowText.includes('keluar')) currentType = 'pengeluaran';
            
            const yearMatch = rowText.match(/\b(20\d{2})\b/);
            if (yearMatch) currentYear = parseInt(yearMatch[1], 10);

            let dateStr = '';
            let amt = NaN;
            let desc = '';

            for (let i = 0; i < parsedCols.length; i++) {
                const col = parsedCols[i];
                const dateMatch = col?.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,}|\d{1,2})/);
                if (dateMatch) {
                    const d = dateMatch[1].padStart(2, '0');
                    let m = dateMatch[2].toLowerCase().substring(0, 3);
                    const months: Record<string, string> = {
                        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'mei': '05',
                        'jun': '06', 'jul': '07', 'aug': '08', 'ags': '08', 'sep': '09', 'oct': '10',
                        'okt': '10', 'nov': '11', 'des': '12', 'dec': '12'
                    };
                    m = months[m] || m.padStart(2, '0');
                    dateStr = `${currentYear}-${m}-${d}`;
                    
                    if (i + 1 < parsedCols.length) desc = parsedCols[i + 1] || '';
                    
                    for (let j = i + 2; j < parsedCols.length; j++) {
                        const rawCol = parsedCols[j];
                        if (!rawCol) continue;
                        const rawAmtVal = rawCol.replace(/[^0-9]/g, '');
                        if (rawAmtVal.length > 0) {
                            amt = parseInt(rawAmtVal, 10);
                            break;
                        }
                    }
                    break;
                }
            }

            if (dateStr && !isNaN(amt) && desc) {
               let user: UserType = 'Suami';
               if (rowText.includes('istri')) user = 'Istri';

               let cat = 'Lainnya';
               if (currentType === 'pemasukan') {
                   cat = 'Gaji'; 
               } else {
                   const d = desc.toLowerCase();
                   if (/makan|food|jajan|kopi|grab|gojek|shopee/i.test(d)) cat = 'Makanan';
                   else if (/listrik|air|internet|wifi|pulsa/i.test(d)) cat = 'Tagihan';
                   else if (/bensin|tol|parkir|krl|bus/i.test(d)) cat = 'Transportasi';
               }

               const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
               newDb.push({ id, date: dateStr, amt, desc, cat, type: currentType, user });
            }
          }
        }

        if (newDb.length > 0) {
          let msg = `Berhasil membaca ${newDb.length} data.`;
          if (skipped > 0) msg += `\n(${skipped} baris dilewati karena format tidak sesuai/kosong)`;
          msg += `\n\nKlik Lanjutkan untuk menggabungkan dengan data saat ini, atau Batal untuk membatalkannya.`;
          
          setImportStatus({show: true, type: 'confirm', msg, data: newDb});
        } else {
          setImportStatus({show: true, type: 'error', msg: 'Gagal mengimpor data. Format CSV mungkin tidak cocok.', data: []});
        }
      } catch (err: any) {
        setImportStatus({show: true, type: 'error', msg: 'Terjadi kesalahan saat mengolah file: ' + err.message, data: []});
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setImportStatus({show: true, type: 'error', msg: 'Gagal membaca file.', data: []});
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const resetForm = () => {
    setEditingId(null);
    setInputType('pengeluaran');
    setInputUser('Suami');
    setInputDate(format(new Date(), 'yyyy-MM-dd'));
    setInputCat('Makanan');
    setInputAmt('');
    setInputDesc('');
    setInputPaymentMethod('tunai');
    setInputIsPaid(false);
  };

  const handleSavePlan = async () => {
    if (!planInput.name || !planInput.cost || !selectedLedgerId || !user) return;
    const cost = parseInt(planInput.cost);
    
    if (editingPlanId) {
      await updateDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/plans/${editingPlanId}`), {
        name: planInput.name,
        cost,
        date: planInput.date
      });
    } else {
      const newPlanRef = doc(collection(firestoreDb, `ledgers/${selectedLedgerId}/plans`));
      await setDoc(newPlanRef, {
        name: planInput.name,
        cost,
        date: planInput.date,
        status: 'planned',
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
    }
    setPlanInput({ name: '', cost: '', date: format(new Date(), 'yyyy-MM-dd') });
    setEditingPlanId(null);
    setShowPlanModal(false);
  };

  const handleDeletePlan = async (id: string) => {
    if (confirm("Hapus rencana ini?") && selectedLedgerId) {
      await deleteDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/plans/${id}`));
    }
  };

  const handleTogglePlan = async (plan: Plan) => {
    if (!selectedLedgerId) return;
    await updateDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/plans/${plan.id}`), {
      status: plan.status === 'planned' ? 'done' : 'planned'
    });
  };

  const handleSaveSavingsGoal = async () => {
    if (!savingsInput.name || !savingsInput.targetAmt || !selectedLedgerId || !user) return;
    const targetAmt = parseInt(savingsInput.targetAmt);
    
    const newGoalRef = doc(collection(firestoreDb, `ledgers/${selectedLedgerId}/savings_goals`));
    await setDoc(newGoalRef, {
      name: savingsInput.name,
      targetAmt,
      currentAmt: 0,
      deadline: savingsInput.deadline,
      createdBy: user.uid,
      createdAt: serverTimestamp()
    });
    
    setSavingsInput({ name: '', targetAmt: '', deadline: '' });
    setShowSavingsModal(false);
  };

  const handleDeleteSavingsGoal = async (id: string) => {
    if (confirm("Hapus tujuan tabungan ini?") && selectedLedgerId) {
      await deleteDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/savings_goals/${id}`));
    }
  };

  const handleAddSavingsAmount = async () => {
    if (!addSavingsAmt || !showAddSavingsAmtModal.goalId || !selectedLedgerId) return;
    const amount = parseInt(addSavingsAmt);
    const goal = savingsGoals.find(g => g.id === showAddSavingsAmtModal.goalId);
    if (!goal) return;

    await updateDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/savings_goals/${goal.id}`), {
      currentAmt: goal.currentAmt + amount
    });

    setAddSavingsAmt('');
    setShowAddSavingsAmtModal({ show: false, goalId: null });
  };

  const navigateToPage = (page: 'home' | 'report' | 'add' | 'stats' | 'history' | 'plans' | 'savings' | 'credits') => {
    if (page !== 'add') {
      resetForm();
    }
    setActivePage(page);
  };

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setInputType(tx.type);
    setInputUser(tx.user);
    setInputDate(tx.date);
    setInputCat(tx.cat);
    setInputAmt(tx.amt.toString());
    setInputDesc(tx.desc);
    setInputPaymentMethod(tx.paymentMethod || 'tunai');
    setInputIsPaid(tx.isPaid || false);
    setActivePage('add');
  };

  const handleDelete = async (txId: string) => {
    if (confirm("Hapus catatan ini?") && selectedLedgerId) {
      try {
        await deleteDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/transactions/${txId}`));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `ledgers/${selectedLedgerId}/transactions/${txId}`);
      }
    }
  };

  const handleSave = async () => {
    const amt = parseInt(inputAmt);
    if (!amt || !inputDesc || !inputDate || !selectedLedgerId || !user) {
      alert("Isi semua bagian!");
      return;
    }

    const baseData: any = {
      date: inputDate,
      amt,
      desc: inputDesc,
      cat: inputCat,
      type: inputType,
      user: inputUser
    };

    if (editingId) {
      const updateData = { ...baseData };
      if (inputType === 'pengeluaran') {
        updateData.paymentMethod = inputPaymentMethod;
        if (inputPaymentMethod === 'kredit') {
          updateData.isPaid = inputIsPaid;
        } else {
          updateData.isPaid = deleteField();
        }
      } else {
        updateData.paymentMethod = deleteField();
        updateData.isPaid = deleteField();
      }
      try {
        await updateDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/transactions/${editingId}`), updateData);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `ledgers/${selectedLedgerId}/transactions/${editingId}`);
      }
    } else {
      const createData = { ...baseData };
      if (inputType === 'pengeluaran') {
        createData.paymentMethod = inputPaymentMethod;
        if (inputPaymentMethod === 'kredit') {
          createData.isPaid = inputIsPaid;
        }
      }
      try {
        const newTxRef = doc(collection(firestoreDb, `ledgers/${selectedLedgerId}/transactions`));
        await setDoc(newTxRef, {
          ...createData,
          createdBy: user.uid,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `ledgers/${selectedLedgerId}/transactions`);
      }
    }
    
    resetForm();
    setCurrentDate(new Date(inputDate));
    setActivePage('history');
  };

  const handleToggleCreditPaid = async (tx: Transaction) => {
    if (!selectedLedgerId) return;
    try {
      await updateDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/transactions/${tx.id}`), {
        isPaid: !tx.isPaid
      });
      setToast({ show: true, msg: tx.isPaid ? 'Status bayar diubah ke Belum Lunas' : 'Status bayar diubah ke Lunas (Saldo terpotong)' });
      setTimeout(() => setToast({ show: false, msg: '' }), 2500);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ledgers/${selectedLedgerId}/transactions/${tx.id}`);
    }
  };

  const handlePayAllCredits = async () => {
    const unpaidList = db.filter(t => t.type === 'pengeluaran' && t.paymentMethod === 'kredit' && !t.isPaid);
    if (unpaidList.length === 0) return;
    
    if (confirm(`Tandai semua (${unpaidList.length}) tagihan kredit sebagai sudah Lunas? (Sisa saldo keuangan Anda akan berkurang berkala)`)) {
      if (!selectedLedgerId) return;
      try {
        const batch = writeBatch(firestoreDb);
        for (const tx of unpaidList) {
          const ref = doc(firestoreDb, `ledgers/${selectedLedgerId}/transactions/${tx.id}`);
          batch.update(ref, { isPaid: true });
        }
        await batch.commit();
        setToast({ show: true, msg: `Semua (${unpaidList.length}) tagihan kredit berhasil dilunasi!` });
        setTimeout(() => setToast({ show: false, msg: '' }), 2500);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `ledgers/${selectedLedgerId}/transactions`);
      }
    }
  };

  const clearData = () => {
    setShowClearConfirm(true);
  };

  const executeClearData = async () => {
    // Cannot easily batch delete all without querying first, but since this is client side let's delete individually
    if (selectedLedgerId) {
       for (const tx of db) {
          await deleteDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/transactions/${tx.id}`));
       }
    }
    setShowClearConfirm(false);
  };

  const handleExecuteImport = async () => {
    if (importStatus.data.length > 0 && selectedLedgerId && user) {
      // Create imported documents
      for (const nD of importStatus.data) {
         if(!db.find(c => c.id === nD.id)) {
            const { id, ...dataToSave } = nD;
            try {
              await setDoc(doc(firestoreDb, `ledgers/${selectedLedgerId}/transactions/${id}`), {
                  ...dataToSave,
                  createdBy: user.uid,
                  createdAt: serverTimestamp()
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `ledgers/${selectedLedgerId}/transactions/${id}`);
            }
         }
      }
      setImportStatus({show: true, type: 'success', msg: 'Data berhasil diimpor!', data: []});
    }
  };

  const globalTunaiExp = db.filter(t => t.type === 'pengeluaran' && (t.paymentMethod !== 'kredit' || t.isPaid)).reduce((a, b) => a + b.amt, 0);
  const globalKreditExp = db.filter(t => t.type === 'pengeluaran' && t.paymentMethod === 'kredit' && !t.isPaid).reduce((a, b) => a + b.amt, 0);
  const globalInc = db.filter(t => t.type === 'pemasukan').reduce((a, b) => a + b.amt, 0);
  const globalBalance = globalInc - globalTunaiExp;

  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const dayData = db.filter(t => t.date === dateStr);
  const dayExpSuami = dayData.filter(t => t.user === 'Suami' && t.type === 'pengeluaran').reduce((a, b) => a + b.amt, 0);
  const dayExpIstri = dayData.filter(t => t.user === 'Istri' && t.type === 'pengeluaran').reduce((a, b) => a + b.amt, 0);
  const dayExpTotal = dayExpSuami + dayExpIstri;
  const dayIncTotal = dayData.filter(t => t.type === 'pemasukan').reduce((a, b) => a + b.amt, 0);

  const viewData = dayData.filter(t => t.type === 'pengeluaran');
  const cats: Record<string, number> = {};
  viewData.forEach(t => {
    cats[t.cat] = (cats[t.cat] || 0) + t.amt;
  });
  const viewTotal = Object.values(cats).reduce((a, b) => a + b, 0);

  const chartData = {
    labels: Object.keys(cats),
    datasets: [{
      data: Object.values(cats),
      backgroundColor: Object.keys(cats).map(k => catStyles[k] || catStyles['Lainnya']),
      borderWidth: 0,
      cutout: '85%'
    }]
  };

  // This month data logic (for Home mainly)
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const thisMonthData = db.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const thisMonthExp = thisMonthData.filter(t => t.type === 'pengeluaran').reduce((a,b) => a+b.amt, 0);
  const thisMonthInc = thisMonthData.filter(t => t.type === 'pemasukan').reduce((a,b) => a+b.amt, 0);

  // Report data logic
  const reportDate = new Date();
  if (reportTime === 'lalu') {
    reportDate.setMonth(reportDate.getMonth() - 1);
  }
  const reportMonth = reportDate.getMonth();
  const reportYear = reportDate.getFullYear();
  
  const reportData = db.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
  });
  
  const reportExp = reportData.filter(t => t.type === 'pengeluaran').reduce((a,b) => a+b.amt, 0);
  const reportInc = reportData.filter(t => t.type === 'pemasukan').reduce((a,b) => a+b.amt, 0);
  const reportBudgetPercentage = monthlyBudget > 0 ? Math.min((reportExp / monthlyBudget) * 100, 100).toFixed(2) : '0';
  const reportRemainingBudget = monthlyBudget - reportExp;

  // Stats data logic
  const statsTargetDate = new Date();
  if (statsTime === 'lalu') {
    if (statsViewType === 'bulan') {
      statsTargetDate.setMonth(statsTargetDate.getMonth() - 1);
    } else {
      statsTargetDate.setFullYear(statsTargetDate.getFullYear() - 1);
    }
  }
  const statsTargetMonth = statsTargetDate.getMonth();
  const statsTargetYear = statsTargetDate.getFullYear();

  const statsFilteredData = db.filter(t => {
    const d = new Date(t.date);
    if (statsViewType === 'bulan') {
      return d.getMonth() === statsTargetMonth && d.getFullYear() === statsTargetYear;
    } else {
      return d.getFullYear() === statsTargetYear;
    }
  });

  const statsExpTotal = statsFilteredData.filter(t => t.type === 'pengeluaran').reduce((a,b) => a+b.amt, 0);
  const statsExpData = statsFilteredData.filter(t => t.type === 'pengeluaran');
  const statsCategoryTotals: Record<string, number> = {};
  statsExpData.forEach(t => {
    statsCategoryTotals[t.cat] = (statsCategoryTotals[t.cat] || 0) + t.amt;
  });
  const statsCategories = Object.keys(statsCategoryTotals).map(k => {
    const percent = statsExpTotal > 0 ? ((statsCategoryTotals[k] / statsExpTotal) * 100).toFixed(2) : '0';
    return { name: k, amount: statsCategoryTotals[k], percent };
  }).sort((a,b) => b.amount - a.amount);

  const statsChartData = {
    labels: statsCategories.map(c => c.name),
    datasets: [{
      data: statsCategories.map(c => c.amount),
      backgroundColor: statsCategories.map(c => catStyles[c.name] || '#94a3b8'),
      borderWidth: 0,
      cutout: '75%'
    }]
  };

  // Group history by date
  const filteredDb = db.filter(tx => {
    const matchesSearch = tx.desc.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         tx.cat.toLowerCase().includes(searchQuery.toLowerCase());
    const txDate = new Date(tx.date).getTime();
    const matchesStartDate = startDate ? txDate >= new Date(startDate).getTime() : true;
    const matchesEndDate = endDate ? txDate <= new Date(endDate).getTime() : true;
    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const groupedHistory = filteredDb.reduce((acc, tx) => {
    if (!acc[tx.date]) acc[tx.date] = [];
    acc[tx.date].push(tx);
    return acc;
  }, {} as Record<string, Transaction[]>);

  const sortedDates = Object.keys(groupedHistory).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const createLedger = async () => {
    if (!newLedgerName || !user) return;
    const newLedgerId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    try {
      await setDoc(doc(firestoreDb, 'ledgers', newLedgerId), {
        name: newLedgerName,
        ownerId: user.uid,
        monthlyBudget: 5000000,
        memberIds: [user.uid],
        createdAt: serverTimestamp()
      });
      setNewLedgerName('');
      setSelectedLedgerId(newLedgerId);
    } catch (e) {
      alert("Gagal membuat kode: " + (e as Error).message);
    }
  };

  const joinLedger = async () => {
    if (!joinLedgerId || !user) return;
    try {
      await updateDoc(doc(firestoreDb, 'ledgers', joinLedgerId), {
        memberIds: arrayUnion(user.uid)
      });
      setJoinLedgerId('');
      setSelectedLedgerId(joinLedgerId);
    } catch (e) {
      alert("Gagal join! Kode tidak valid atau tidak diizinkan. " + (e as Error).message);
    }
  };

  if (authChecking || showSplash) {
    return (
      <div className="flex flex-col min-h-screen sm:h-screen sm:py-4 bg-slate-100 sm:items-center sm:justify-center">
        <div className="w-full h-screen sm:h-[850px] sm:max-h-[90vh] sm:max-w-[400px] flex flex-col relative bg-blue-900 sm:rounded-[40px] sm:overflow-hidden sm:shadow-2xl">
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)", transition: { duration: 0.6, ease: "easeInOut" } }}
              className="absolute inset-0 z-[100] bg-gradient-to-b from-blue-800 to-blue-950 flex flex-col items-center justify-center text-white overflow-hidden"
            >
              {/* Background decorative elements */}
              <motion.div 
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.3, scale: 1 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl -top-20 -left-20"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.2, scale: 1 }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                className="absolute w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-3xl -bottom-20 -right-20"
              />

              <motion.div 
                initial={{ scale: 0.5, opacity: 0, rotate: -10, y: 20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0, y: 0 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 260, 
                  damping: 20, 
                  duration: 0.8 
                }}
                className="w-28 h-28 bg-white/10 rounded-[32px] backdrop-blur-md flex items-center justify-center mb-8 shadow-2xl border border-white/20 p-3 relative z-10"
              >
                <motion.div
                  animate={{ 
                    boxShadow: ["0px 0px 0px 0px rgba(255,255,255,0)", "0px 0px 40px 10px rgba(255,255,255,0.1)", "0px 0px 0px 0px rgba(255,255,255,0)"]
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-[32px]"
                />
                <img src="/fk.png" alt="FinancialKita" className="w-full h-full object-contain relative z-10" />
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                className="text-4xl font-black mb-3 tracking-tight relative z-10"
              >
                FinancialKita
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
                className="text-blue-200 text-sm font-medium tracking-wide relative z-10"
              >
                Pencatatan Keuangan Keluarga
              </motion.p>
              
              <div className="absolute bottom-12 flex flex-col items-center gap-2 z-10">
                <div className="flex gap-2">
                  {[0,1,2].map(i => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
                      transition={{ 
                        y: { duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" },
                        opacity: { duration: 0.3, delay: 0.6 + (i * 0.1) },
                        scale: { duration: 0.3, delay: 0.6 + (i * 0.1) }
                      }}
                      className="w-2.5 h-2.5 rounded-full bg-blue-300 shadow-[0_0_8px_rgba(147,197,253,0.5)]"
                    />
                  ))}
                </div>
              </div>
            </motion.div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen sm:h-screen sm:py-4 bg-slate-100 sm:items-center sm:justify-center">
        <div className="w-full h-screen sm:h-[850px] sm:max-h-[90vh] sm:max-w-[400px] flex flex-col relative bg-blue-900 sm:rounded-[40px] sm:overflow-hidden sm:shadow-2xl p-8 items-center justify-center text-white">
          <div className="w-24 h-24 bg-white/10 rounded-3xl backdrop-blur-sm flex items-center justify-center mb-6 shadow-2xl border border-white/20 p-2">
             <img src="/fk.png" alt="FinancialKita" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-black mb-2 tracking-tight">FinancialKita</h1>
          <p className="text-blue-200 text-sm font-medium tracking-wide mb-12 text-center">Silakan Masuk dengan Google untuk melanjutkan</p>
          <button 
            onClick={signInWithGoogle}
            className="w-full py-4 bg-white text-blue-900 rounded-2xl font-bold text-lg shadow-xl active:scale-95 transition-transform"
          >
            Masuk dengan Google
          </button>
        </div>
      </div>
    );
  }

  if (!selectedLedgerId) {
    return (
      <div className="flex flex-col min-h-screen sm:h-screen sm:py-4 bg-slate-100 sm:items-center sm:justify-center">
        <div className="w-full h-screen sm:h-[850px] sm:max-h-[90vh] sm:max-w-[400px] flex flex-col relative bg-slate-50 sm:rounded-[40px] overflow-y-auto sm:shadow-2xl">
          <div className="bg-blue-900 p-8 pb-12 pt-16 text-white rounded-b-[3rem] shadow-lg mb-8">
            <h1 className="text-2xl font-black mb-2">Halo, {user.displayName}</h1>
            <p className="text-blue-200 text-sm">Pilih buku pencatatan atau buat yang baru.</p>
          </div>
          
          <div className="px-6 flex flex-col gap-6 pb-6">
            {ledgers.length > 0 && (
              <div className="flex flex-col gap-3">
                 <h3 className="font-bold text-gray-800 px-2 text-sm uppercase tracking-wide">Buku Kamu</h3>
                 {ledgers.map(l => (
                   <button 
                     key={l.id} 
                     onClick={() => setSelectedLedgerId(l.id)}
                     className="w-full bg-white p-5 rounded-3xl shadow-sm border border-slate-100 text-left hover:border-blue-300 active:scale-95 transition-all flex justify-between items-center group"
                   >
                     <div>
                       <h4 className="font-bold text-gray-800 text-lg mb-0.5">{l.name}</h4>
                       <p className="text-xs text-gray-500 font-mono">ID: {l.id}</p>
                     </div>
                     <ChevronRight className="text-gray-300 group-hover:text-blue-500 transition-colors"/>
                   </button>
                 ))}
                 <div className="h-4"></div>
              </div>
            )}

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
               <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><BookPlus className="w-5 h-5 text-blue-600"/> Buat Buku Baru</h3>
               <p className="text-xs text-gray-500 mb-4">Buat buku pencatatan baru untuk kamu kelola bersama keluarga.</p>
               <input 
                  type="text"
                  placeholder="Nama Pencatatan (misal: Buku Rumah)"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newLedgerName}
                  onChange={e => setNewLedgerName(e.target.value)}
               />
               <button onClick={createLedger} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl active:scale-95 transition-transform text-sm shadow-md">
                 Buat Pencatatan Baru
               </button>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
               <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500"/> Gabung Buku Lain</h3>
               <p className="text-xs text-gray-500 mb-4">Masukkan kode (ID) buku yang telah dibuat oleh pasanganmu.</p>
               <input 
                  type="text"
                  placeholder="Masukkan Kode Buku"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  value={joinLedgerId}
                  onChange={e => setJoinLedgerId(e.target.value)}
               />
               <button onClick={joinLedger} className="w-full py-3.5 bg-indigo-500 text-white font-bold rounded-2xl active:scale-95 transition-transform text-sm shadow-md">
                 Gabung Pencatatan
               </button>
            </div>
          </div>
          
          <div className="mt-auto p-6 pt-0">
             <button onClick={logout} className="w-full py-3 flex items-center justify-center gap-2 text-gray-400 font-bold bg-gray-100 rounded-2xl">
               <LogOut className="w-4 h-4"/> Keluar Akun
             </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedLedger = ledgers.find(l => l.id === selectedLedgerId);

  return (
    <div className="flex flex-col min-h-screen sm:h-screen sm:py-4 bg-slate-100 sm:items-center sm:justify-center">
      <div className="w-full h-screen sm:h-[850px] sm:max-h-[90vh] sm:max-w-[400px] flex flex-col relative bg-blue-900 sm:rounded-[40px] sm:overflow-hidden sm:shadow-2xl">
        {/* HEADER: SALDO TOTAL & TAB */}
        <div className="p-4 pt-6 text-white text-center shrink-0 flex flex-col items-center relative select-none">
          {toast.show && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-20 z-[60] bg-white text-blue-900 px-4 py-2 rounded-full text-xs font-bold shadow-xl border border-blue-100"
            >
              {toast.msg}
            </motion.div>
          )}

          <div className="absolute top-4 left-4 z-50">
             <button 
               onClick={logout}
               className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-2xl text-red-100 backdrop-blur-md flex items-center gap-1.5 shadow-lg active:scale-90 transition-all cursor-pointer border border-white/10"
             >
               <LogOut className="w-4 h-4"/>
               <span className="text-[10px] font-bold uppercase tracking-tight">Keluar</span>
             </button>
          </div>
          <div className="absolute top-4 right-4 z-50">
             <button 
               onClick={() => {
                 if (navigator.clipboard) {
                   navigator.clipboard.writeText(selectedLedgerId || '');
                   setToast({show: true, msg: 'ID Buku Berhasil Disalin!'});
                   setTimeout(() => setToast({show: false, msg: ''}), 2000);
                 } else {
                   alert(`Bagikan ID ini ke pasangan: ${selectedLedgerId}`);
                 }
               }} 
               className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-2xl text-white backdrop-blur-md flex items-center gap-1 shadow-lg active:scale-90 transition-all cursor-pointer border border-white/10"
             >
                <Users className="w-5 h-5"/>
                <span className="text-xs font-bold leading-none">Undang</span>
             </button>
          </div>
          
          <div 
            onClick={() => setSelectedLedgerId(null)}
            className="cursor-pointer active:scale-95 transition-transform"
          >
            <h2 className="text-xl font-bold mb-1 mt-6 flex items-center justify-center gap-2">
              {selectedLedger?.name || 'FinancialKita'}
              <ChevronLeft className="w-4 h-4 opacity-50" />
            </h2>
            <div className="bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm inline-flex items-center gap-2 mb-4 hover:bg-white/20 transition-colors">
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-200">Ubah Buku (ID):</span>
              <span className="text-xs font-mono font-bold select-all">{selectedLedgerId}</span>
            </div>
          </div>

          <p className="text-[9px] uppercase opacity-60 font-bold mb-1">Saldo Keseluruhan</p>
          <h2 className="text-2xl font-black">
            Rp {globalBalance.toLocaleString('id-ID')}
          </h2>
          {globalKreditExp > 0 && (
            <div className="bg-orange-500/20 px-3 py-1 rounded-full mt-2 inline-flex items-center gap-2 border border-orange-400/30">
               <span className="text-[10px] text-orange-200 uppercase font-bold tracking-wider">Total Kredit</span>
               <span className="text-xs font-black text-orange-100">Rp {globalKreditExp.toLocaleString('id-ID')}</span>
            </div>
          )}
        </div>

        <div className="content-area flex-1 bg-slate-50 rounded-t-[30px] overflow-y-auto overflow-x-hidden pb-[100px] sm:pb-[120px] relative">

        <AnimatePresence mode="wait">
        {/* HALAMAN 1: BERANDA */}
        {activePage === 'home' && (
          <motion.div 
            key="home"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-5"
          >
            {/* Navigasi Tanggal */}
            <div className="flex justify-between items-center mb-5">
              <button 
                onClick={() => setCurrentDate(d => addDays(d, -1))} 
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white shadow-sm active:bg-gray-100 transition-colors"
                aria-label="Hari sebelumnya"
              >
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>
              <div className="text-center">
                <span className="font-bold text-gray-700 text-sm">
                  {format(currentDate, 'dd MMMM yyyy', { locale: id })}
                </span>
                <button 
                  onClick={() => setCurrentDate(new Date())} 
                  className="block mx-auto text-[9px] text-blue-600 font-bold uppercase cursor-pointer italic mt-1 p-2 -mx-2 hover:bg-blue-50 rounded-full transition-colors"
                >
                  Kembali ke Hari Ini
                </button>
              </div>
              <button 
                onClick={() => setCurrentDate(d => addDays(d, 1))} 
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white shadow-sm active:bg-gray-100 transition-colors"
                aria-label="Hari selanjutnya"
              >
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Quick Actions / New Features */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              <button 
                onClick={() => setActivePage('plans')}
                className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center active:scale-95 transition-all text-left group"
              >
                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors mb-1.5">
                  <ListTodo className="w-4.5 h-4.5" />
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black text-gray-800 leading-tight">Rencana</p>
                  <p className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">{plans.filter(p => p.status === 'planned').length} Aktif</p>
                </div>
              </button>
              <button 
                onClick={() => setActivePage('savings')}
                className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center active:scale-95 transition-all text-left group"
              >
                <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-1.5">
                  <PiggyBank className="w-4.5 h-4.5" />
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black text-gray-800 leading-tight">Tabungan</p>
                  <p className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">{savingsGoals.length} Target</p>
                </div>
              </button>
              <button 
                onClick={() => setActivePage('credits')}
                className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center active:scale-95 transition-all text-left group animate-pulse"
                id="quick-action-credits"
              >
                <div className="w-9 h-9 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors mb-1.5 text-sm">
                  💳
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black text-gray-800 leading-tight">Kredit</p>
                  <p className="text-[8px] text-orange-600 font-bold uppercase mt-0.5">{db.filter(t => t.type === 'pengeluaran' && t.paymentMethod === 'kredit' && !t.isPaid).length} Tagihan</p>
                </div>
              </button>
            </div>

            {/* FOKUS UTAMA: TOTAL PENGELUARAN HARIAN */}
            <div className="bg-white rounded-2xl p-5 text-center shadow-[0_10px_25px_rgba(0,0,0,0.05)] mb-5 border border-slate-200">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Total Pengeluaran Harian</p>
                <h1 className="text-3xl font-black text-red-500">Rp {dayExpTotal.toLocaleString('id-ID')}</h1>
                <div className="flex justify-center gap-4 mt-3 pt-3 border-t border-gray-50">
                    <div className="text-center">
                        <p className="text-[8px] text-blue-400 font-bold uppercase">Suami</p>
                        <p className="text-xs font-bold text-gray-600 italic">Rp {dayExpSuami.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="w-px h-6 bg-gray-100"></div>
                    <div className="text-center">
                        <p className="text-[8px] text-pink-400 font-bold uppercase">Istri</p>
                        <p className="text-xs font-bold text-gray-600 italic">Rp {dayExpIstri.toLocaleString('id-ID')}</p>
                    </div>
                </div>
            </div>

            {/* Pemasukan Hari Ini */}
            <div className="bg-green-50 p-3 rounded-2xl border-l-4 border-green-500 mb-6 flex justify-between items-center">
                <span className="text-[10px] font-bold text-green-700 uppercase">Pemasukan Hari Ini</span>
                <span className="font-black text-green-700">Rp {dayIncTotal.toLocaleString('id-ID')}</span>
            </div>

            {/* Chart */}
            <div className="relative h-48 w-48 sm:h-56 sm:w-56 mx-auto mb-8 bg-white rounded-full p-3 shadow-[0_5px_15px_rgba(0,0,0,0.05)] border border-slate-50">
              {Object.keys(cats).length > 0 ? (
                <Doughnut data={chartData} options={{ plugins: { legend: { display: false } }, maintainAspectRatio: false }} />
              ) : (
                <div className="w-full h-full rounded-full border-[15px] border-slate-100"></div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[9px] uppercase font-black text-blue-400 tracking-widest px-4 leading-tight mb-1">
                  Distribusi Harian
                </span>
                <span className="text-blue-200">
                   <svg fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6 mx-auto"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {Object.keys(cats).length === 0 && (
                <motion.p 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                  className="text-center text-gray-400 py-6 text-sm font-medium text-xs"
                >
                  Tidak ada pengeluaran hari ini
                </motion.p>
              )}
              {Object.entries(cats).map(([catName, amount], index) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={catName} 
                  className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-50 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs" 
                      style={{ backgroundColor: catStyles[catName] || catStyles['Lainnya'] }}
                    >
                      <Tag className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-gray-700 text-sm">{catName}</span>
                  </div>
                  <span className="font-black text-gray-800 text-sm">
                    Rp {amount.toLocaleString('id-ID')}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* HALAMAN 2: LAPORAN */}
        {activePage === 'report' && (
          <motion.div 
            key="report"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-5"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-gray-800">Laporan</h2>
            </div>
            
            <div className="bg-white p-5 rounded-3xl shadow-[0_5px_15px_rgba(0,0,0,0.05)] border border-slate-100 mb-6">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-50">
                <div className="flex gap-4">
                  <button onClick={() => setReportTime('ini')} className={`font-bold transition-colors ${reportTime === 'ini' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-gray-400 hover:text-gray-600'}`}>Bulan ini</button>
                  <button onClick={() => setReportTime('lalu')} className={`font-bold transition-colors ${reportTime === 'lalu' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-gray-400 hover:text-gray-600'}`}>Bulan lalu</button>
                </div>
              </div>
              <div className="flex items-center mt-2">
                <div className="w-1/4 flex flex-col items-center justify-center border-r border-gray-100">
                  <span className="text-4xl font-light text-gray-800 leading-none">{format(reportDate, 'MM')}</span>
                </div>
                <div className="w-3/4 flex justify-around pl-4">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Pengeluaran</p>
                    <p className="font-semibold text-gray-800">{reportExp.toLocaleString('id-ID')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Penghasilan</p>
                    <p className="font-semibold text-gray-800">{reportInc.toLocaleString('id-ID')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-5 rounded-3xl shadow-lg shadow-blue-500/30 mb-6 text-white relative overflow-hidden">
              {/* decorative circle */}
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
              <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
              
              <div className="flex justify-between items-center mb-6 relative z-10">
                <span className="font-bold text-white tracking-wide">Anggaran bulanan</span>
                <button onClick={() => {
                  setTempBudget(monthlyBudget.toString());
                  setIsEditingBudget(true);
                }} className="text-[10px] bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors">
                  <Settings className="w-3 h-3"/> Edit
                </button>
              </div>
              
              <div className="flex items-center gap-5 relative z-10">
                <div className="w-24 h-24 relative shrink-0">
                   <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <defs>
                        <linearGradient id="budgetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#818cf8" />
                          <stop offset="100%" stopColor="#c084fc" />
                        </linearGradient>
                      </defs>
                      <path
                        className="text-white/20"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        stroke="url(#budgetGrad)"
                        strokeDasharray={`${reportBudgetPercentage}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <span className="text-xl font-black text-white">{reportBudgetPercentage}%</span>
                   </div>
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm shadow-sm border border-white/10">
                     <p className="text-indigo-100 text-[10px] uppercase font-bold tracking-wider mb-1">Tersisa</p>
                     <p className="font-bold text-lg leading-none">Rp {reportRemainingBudget.toLocaleString('id-ID')}</p>
                  </div>
                  <div className="flex flex-col px-1 gap-1 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-indigo-100 text-[10px]">Anggaran</span>
                      <span className="font-semibold text-white text-[11px]">{monthlyBudget.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-indigo-100 text-[10px]">Pengeluaran</span>
                      <span className="font-semibold text-white text-[11px]">{reportExp.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* HALAMAN 3: TAMBAH DATA */}
        {activePage === 'add' && (
          <motion.div 
            key="add"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-gray-800">{editingId ? 'Edit Transaksi' : 'Catat Transaksi'}</h2>
              {editingId && (
                <button onClick={() => navigateToPage('history')} className="text-xs text-gray-500 font-bold underline">
                  Batal
                </button>
              )}
            </div>
            
            <div className="space-y-5">
              {/* User Selector (Suami / Istri) */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 mb-2 block">Oleh Siapa?</label>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setInputUser('Suami')} 
                    className={`flex-1 py-3 rounded-xl font-bold transition ${
                      inputUser === 'Suami' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    SUAMI
                  </button>
                  <button 
                    onClick={() => setInputUser('Istri')} 
                    className={`flex-1 py-3 rounded-xl font-bold transition ${
                      inputUser === 'Istri' ? 'bg-pink-500 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    ISTRI
                  </button>
                </div>
              </div>

              {/* Jenis Transaksi */}
              <div className="flex bg-gray-100 p-1 rounded-2xl">
                <button 
                  onClick={() => setInputType('pengeluaran')} 
                  className={`flex-1 py-2 rounded-xl font-bold transition ${
                    inputType === 'pengeluaran' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  PENGELUARAN
                </button>
                <button 
                  onClick={() => setInputType('pemasukan')} 
                  className={`flex-1 py-2 rounded-xl font-bold transition ${
                    inputType === 'pemasukan' ? 'bg-white text-green-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  PEMASUKAN
                </button>
              </div>

              {inputType === 'pengeluaran' && (
                <div className="flex flex-col gap-2">
                  <div className="flex bg-gray-100 p-1 rounded-2xl">
                    <button 
                      onClick={() => setInputPaymentMethod('tunai')} 
                      className={`flex-1 py-1.5 rounded-xl font-bold transition text-sm ${
                        inputPaymentMethod === 'tunai' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      TUNAI
                    </button>
                    <button 
                      onClick={() => setInputPaymentMethod('kredit')} 
                      className={`flex-1 py-1.5 rounded-xl font-bold transition text-sm ${
                        inputPaymentMethod === 'kredit' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      KREDIT
                    </button>
                  </div>

                  {inputPaymentMethod === 'kredit' && (
                    <div className="flex items-center justify-between bg-orange-50/50 border border-orange-100 p-3 rounded-2xl">
                      <div>
                        <p className="text-xs font-black text-gray-800">Status Pembayaran</p>
                        <p className="text-[10px] text-gray-500 font-medium">Apakah kredit ini sudah Anda bayar?</p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setInputIsPaid(!inputIsPaid)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 ${
                          inputIsPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-current"></span>
                        {inputIsPaid ? 'SUDAH DIBAYAR' : 'BELUM DIBAYAR'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 mb-1 block">Tanggal</label>
                  <input 
                    type="date" 
                    value={inputDate}
                    onChange={e => setInputDate(e.target.value)}
                    className="w-full bg-white border-[1.5px] border-gray-200 p-3 rounded-xl text-sm font-medium outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 mb-1 block">Kategori</label>
                  <select 
                    value={inputCat}
                    onChange={e => setInputCat(e.target.value)}
                    className="w-full bg-white border-[1.5px] border-gray-200 p-3 rounded-xl text-sm font-medium outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all"
                  >
                    <option value="Makanan">🍟 Makanan</option>
                    <option value="Belanja">🛍️ Belanja</option>
                    <option value="Transport">🚗 Transport</option>
                    <option value="Gaji">💰 Gaji/Bonus</option>
                    <option value="Lainnya">📦 Lainnya</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 mb-1 block">Jumlah Uang</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rp</span>
                  <input 
                    type="number" 
                    inputMode="numeric" 
                    placeholder="0" 
                    value={inputAmt}
                    onChange={e => setInputAmt(e.target.value)}
                    className="w-full bg-white border-[1.5px] border-gray-200 py-3 pl-12 pr-4 rounded-xl text-xl font-bold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all text-blue-700"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 mb-1 block">Keterangan</label>
                <input 
                  type="text" 
                  placeholder="Misal: Beli makan siang" 
                  value={inputDesc}
                  onChange={e => setInputDesc(e.target.value)}
                  className="w-full bg-white border-[1.5px] border-gray-200 p-3 rounded-xl text-sm font-medium outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all"
                />
              </div>

              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={handleSave} 
                className="w-full bg-blue-600 py-4 rounded-2xl text-white font-black text-lg shadow-lg mt-4 flex items-center justify-center gap-2"
              >
                SIMPAN CATATAN
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* HALAMAN 4: STATISTIK */}
        {activePage === 'stats' && (
          <motion.div 
            key="stats"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="pb-6"
          >
            <div className="p-5 border-b border-gray-100 bg-white sticky top-0 z-10 shadow-sm">
              <div className="flex justify-center border-b border-slate-100 pb-4 mb-4">
                <div className="bg-slate-100 p-1 rounded-xl flex w-2/3">
                  <button 
                    onClick={() => setStatsViewType('bulan')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${statsViewType === 'bulan' ? 'bg-blue-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Bulan
                  </button>
                  <button 
                    onClick={() => setStatsViewType('tahun')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${statsViewType === 'tahun' ? 'bg-blue-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Tahun
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-gray-400 px-2">
                 {statsViewType === 'bulan' ? (
                   <>
                     <button onClick={() => setStatsTime('lalu')} className={`transition-colors ${statsTime === 'lalu' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'hover:text-gray-600'}`}>Bulan lalu</button>
                     <button onClick={() => setStatsTime('ini')} className={`transition-colors ${statsTime === 'ini' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'hover:text-gray-600'}`}>Bulan ini</button>
                   </>
                 ) : (
                   <>
                     <button onClick={() => setStatsTime('lalu')} className={`transition-colors ${statsTime === 'lalu' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'hover:text-gray-600'}`}>Tahun lalu</button>
                     <button onClick={() => setStatsTime('ini')} className={`transition-colors ${statsTime === 'ini' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'hover:text-gray-600'}`}>Tahun ini</button>
                   </>
                 )}
              </div>
            </div>

            <div className="p-5">
              {statsCategories.length > 0 ? (
                <>
                  <div className="flex flex-col gap-6 mb-8 mt-2">
                    <div className="flex items-center">
                      <div className="w-1/2 relative h-32 pl-2">
                         <Doughnut data={statsChartData} options={{plugins: {legend: {display: false}}, maintainAspectRatio: false, cutout: '70%'}} />
                         <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-800">{statsExpTotal.toLocaleString('id-ID')}</span>
                         </div>
                      </div>
                      
                      <div className="w-1/2 pl-6 space-y-2.5">
                         {statsCategories.slice(0, 5).map(c => (
                            <div key={c.name} className="flex items-center text-[10px] font-semibold text-gray-500">
                               <div className="w-2.5 h-2.5 rounded-full mr-2.5 shrink-0" style={{backgroundColor: catStyles[c.name] || '#ccc'}}></div>
                               <span className="flex-1 truncate pr-2">{c.name}</span>
                               <span className="text-gray-700">{c.percent}%</span>
                            </div>
                         ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {statsCategories.map(c => (
                       <div key={c.name} className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-sm">
                             <div className="flex items-center gap-3">
                               <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm" style={{backgroundColor: catStyles[c.name] || '#ccc'}}>
                                  <span className="text-xs font-bold">{c.name.charAt(0)}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                 <span className="font-bold text-gray-700">{c.name}</span>
                                 <span className="text-xs font-semibold text-gray-400">{c.percent}%</span>
                               </div>
                             </div>
                             <span className="font-bold text-gray-800 text-sm pr-1">{c.amount.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden ml-12 max-w-[calc(100%-48px)]">
                             <div className="h-full rounded-full" style={{width: `${c.percent}%`, backgroundColor: catStyles[c.name] || '#ccc'}}></div>
                          </div>
                       </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-20 text-center">
                  <PieChart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium text-sm">Belum ada statistik untuk bulan ini</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* HALAMAN 6: PERENCANAAN */}
        {activePage === 'plans' && (
          <motion.div 
            key="plans"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => navigateToPage('home')}
                  className="p-1.5 rounded-xl border border-slate-100 bg-white shadow-sm hover:bg-slate-50 text-gray-500 transition-all active:scale-95 shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h2 className="text-xl font-black text-gray-800">Perencanaan</h2>
              </div>
              <button 
                onClick={() => setShowPlanModal(true)}
                className="bg-blue-600 text-white p-2 rounded-xl shadow-lg active:scale-95 transition-all"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {plans.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                  <ListTodo className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-center text-gray-500 font-medium text-sm">Belum ada rencana</p>
                </div>
              )}
              {plans.map(plan => (
                <div 
                  key={plan.id}
                  className={`bg-white p-4 rounded-2xl border transition-all ${plan.status === 'done' ? 'border-green-100 bg-green-50/30 opacity-75' : 'border-slate-100 shadow-sm'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex gap-3">
                      <button 
                        onClick={() => handleTogglePlan(plan)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${plan.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-200 text-transparent'}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <div>
                        <h4 className={`font-bold text-sm ${plan.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{plan.name}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Estimasi: Rp {plan.cost.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => {
                          setPlanInput({ name: plan.name, cost: plan.cost.toString(), date: plan.date });
                          setEditingPlanId(plan.id);
                          setShowPlanModal(true);
                        }}
                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDeletePlan(plan.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold">
                    <Clock className="w-3 h-3" />
                    {format(new Date(plan.date), 'dd MMM yyyy', { locale: id })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* HALAMAN 7: TABUNGAN */}
        {activePage === 'savings' && (
          <motion.div 
            key="savings"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => navigateToPage('home')}
                  className="p-1.5 rounded-xl border border-slate-100 bg-white shadow-sm hover:bg-slate-50 text-gray-500 transition-all active:scale-95 shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h2 className="text-xl font-black text-gray-800">Tabungan</h2>
              </div>
              <button 
                onClick={() => setShowSavingsModal(true)}
                className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg active:scale-95 transition-all"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {savingsGoals.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                  <PiggyBank className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-center text-gray-500 font-medium text-sm">Belum ada target tabungan</p>
                </div>
              )}
              {savingsGoals.map(goal => {
                const progress = Math.min((goal.currentAmt / goal.targetAmt) * 100, 100);
                return (
                  <div key={goal.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
                    {progress >= 100 && (
                      <div className="absolute top-0 right-0 p-2 bg-yellow-400 text-white rounded-bl-xl shadow-sm">
                        <Trophy className="w-4 h-4" />
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-black text-gray-800 text-lg mb-1">{goal.name}</h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                          <Target className="w-3 h-3" />
                          Target: Rp {goal.targetAmt.toLocaleString('id-ID')}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteSavingsGoal(goal.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black text-indigo-600 uppercase">Progres</span>
                        <span className="text-xs font-black text-gray-800">{progress.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          className={`h-full rounded-full ${progress >= 100 ? 'bg-yellow-400' : 'bg-indigo-500'}`}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-bold text-gray-500">
                        <span>Rp {goal.currentAmt.toLocaleString('id-ID')}</span>
                        <span>Sisa Rp {(goal.targetAmt - goal.currentAmt).toLocaleString('id-ID')}</span>
                      </div>
                    </div>

                    <button 
                      onClick={() => setShowAddSavingsAmtModal({ show: true, goalId: goal.id })}
                      className="w-full py-2.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl font-black text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> TAMBAH SALDO
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activePage === 'credits' && (
          <motion.div 
            key="credits"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-6 text-gray-800"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => navigateToPage('home')}
                  className="p-1.5 rounded-xl border border-slate-100 bg-white shadow-sm hover:bg-slate-50 text-gray-500 transition-all active:scale-95 shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-black text-gray-800">Manajemen Kredit</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Hutang & Cicilan Keluarga</p>
                </div>
              </div>
              <div className="w-10 h-10 bg-orange-100 rounded-2xl flex items-center justify-center text-xl">
                💳
              </div>
            </div>

            {/* Credit Cards Summary */}
            {(() => {
              const unpaidCreditTransactions = db.filter(t => t.type === 'pengeluaran' && t.paymentMethod === 'kredit' && !t.isPaid);
              const paidCreditTransactions = db.filter(t => t.type === 'pengeluaran' && t.paymentMethod === 'kredit' && t.isPaid);
              const allCreditTransactions = db.filter(t => t.type === 'pengeluaran' && t.paymentMethod === 'kredit');

              const totalUnpaidCreditAmt = unpaidCreditTransactions.reduce((a, b) => a + b.amt, 0);
              const totalPaidCreditAmt = paidCreditTransactions.reduce((a, b) => a + b.amt, 0);

              const filteredList = allCreditTransactions.filter(t => {
                if (creditFilter === 'unpaid') return !t.isPaid;
                if (creditFilter === 'paid') return t.isPaid;
                return true;
              });

              return (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-4 rounded-3xl text-white shadow-md relative overflow-hidden">
                      <div className="absolute -right-4 -bottom-4 text-white/10 text-6xl font-black select-none">
                        !
                      </div>
                      <p className="text-[9px] uppercase opacity-75 font-bold mb-1">Belum Dibayar</p>
                      <h3 className="text-lg font-black leading-tight">
                        Rp {totalUnpaidCreditAmt.toLocaleString('id-ID')}
                      </h3>
                      <p className="text-[8px] font-bold mt-1.5 opacity-90 uppercase">
                        {unpaidCreditTransactions.length} Transaksi
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 rounded-3xl text-white shadow-md relative overflow-hidden">
                      <div className="absolute -right-4 -bottom-4 text-white/10 text-6xl font-black select-none">
                        ✓
                      </div>
                      <p className="text-[9px] uppercase opacity-75 font-bold mb-1">Sudah Dibayar</p>
                      <h3 className="text-lg font-black leading-tight">
                        Rp {totalPaidCreditAmt.toLocaleString('id-ID')}
                      </h3>
                      <p className="text-[8px] font-bold mt-1.5 opacity-90 uppercase">
                        {paidCreditTransactions.length} Transaksi
                      </p>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex bg-gray-100 p-1 rounded-2xl mb-4 text-xs font-bold">
                    <button 
                      onClick={() => setCreditFilter('unpaid')} 
                      className={`flex-1 py-2 rounded-xl transition-all ${
                        creditFilter === 'unpaid' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      BELUM DIBAYAR ({unpaidCreditTransactions.length})
                    </button>
                    <button 
                      onClick={() => setCreditFilter('paid')} 
                      className={`flex-1 py-1.5 rounded-xl transition-all ${
                        creditFilter === 'paid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      SUDAH ({paidCreditTransactions.length})
                    </button>
                    <button 
                      onClick={() => setCreditFilter('all')} 
                      className={`flex-1 py-1.5 rounded-xl transition-all ${
                        creditFilter === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      SEMUA ({allCreditTransactions.length})
                    </button>
                  </div>

                  {/* Bulk Settle Button */}
                  {unpaidCreditTransactions.length > 0 && (creditFilter === 'unpaid' || creditFilter === 'all') && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-4"
                    >
                      <button 
                        onClick={handlePayAllCredits}
                        className="w-full py-3 px-4 bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm border border-orange-100/50"
                      >
                        💳 Lunasi Semua ({unpaidCreditTransactions.length}) Tagihan
                      </button>
                    </motion.div>
                  )}

                  {/* List */}
                  <div className="space-y-3 pb-20">
                    {filteredList.length === 0 ? (
                      <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm text-gray-400 flex flex-col items-center">
                        <span className="text-3xl mb-2">🎉</span>
                        <p className="text-xs font-bold text-gray-700">Tidak ada transaksi kredit</p>
                        <p className="text-[10px] text-gray-400 mt-1 pb-1">
                          {creditFilter === 'unpaid' ? 'Semua tagihan kredit sudah lunas terbayar!' : 'Belum ada transaksi kredit yang tercatat.'}
                        </p>
                      </div>
                    ) : (
                      filteredList.map(t => (
                        <div 
                          key={t.id}
                          className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3 hover:border-orange-200 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm shrink-0 ${
                                t.user === 'Suami' ? 'bg-blue-500' : 'bg-pink-500'
                              }`}>
                                {t.user[0]}
                              </span>
                              <div>
                                <h4 className="font-semibold text-gray-800 text-xs">{t.desc}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[9px] text-gray-500 font-bold bg-slate-150 bg-gray-100 px-1.5 py-0.5 rounded uppercase">
                                    {t.cat}
                                  </span>
                                  <span className="text-[9px] text-gray-400 font-medium">
                                    {format(new Date(t.date), 'dd MMM yyyy', { locale: id })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-red-500">Rp {t.amt.toLocaleString('id-ID')}</p>
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full inline-block uppercase mt-1 ${
                                t.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                              }`}>
                                {t.isPaid ? 'Lunas' : 'Belum Lunas'}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2.5 border-t border-slate-50">
                            <div className="flex gap-1.5">
                              <button 
                                onClick={() => handleEdit(t)} 
                                className="px-2 py-1 text-[9px] font-bold border border-slate-150 hover:border-slate-200 text-gray-600 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                              >
                                <Edit2 className="w-2.5 h-2.5" /> EDIT
                              </button>
                              <button 
                                onClick={() => handleDelete(t.id)} 
                                className="px-2 py-1 text-[9px] font-bold border border-red-100 hover:border-red-200 text-red-500 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                              >
                                <Trash2 className="w-2.5 h-2.5" /> HAPUS
                              </button>
                            </div>

                            <button 
                              onClick={() => handleToggleCreditPaid(t)}
                              className={`px-3 py-1 text-[9px] font-bold rounded-lg flex items-center gap-1.5 transition-all text-white active:scale-95 shadow-sm ${
                                t.isPaid ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {t.isPaid ? (
                                <>
                                  <Circle className="w-2.5 h-2.5" /> BELUM LUNAS
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5" /> LUNASI SEKARANG
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}

        {activePage === 'history' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-6"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-gray-800">Semua Catatan</h2>
              <div className="flex gap-2 items-center">
                <input 
                  type="file" 
                  accept=".csv" 
                  ref={fileInputRef} 
                  onChange={handleImportCSV} 
                  className="hidden" 
                />
                <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition" title="Import CSV">
                  <Upload className="w-4 h-4" />
                </button>
                <button onClick={handleExportCSV} className="w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition" title="Export CSV">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={clearData} className="pl-2 pr-3 h-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition gap-1.5" title="Hapus Semua">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Reset</span>
                </button>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Cari deskripsi atau kategori..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 py-2.5 pl-10 pr-4 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                />
              </div>

              {/* Date Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                   <span className="absolute top-1 left-2.5 text-[8px] font-bold uppercase text-gray-400 pointer-events-none">Dari</span>
                   <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 pt-4 pb-1.5 px-2.5 rounded-xl text-[10px] font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
                <div className="relative">
                   <span className="absolute top-1 left-2.5 text-[8px] font-bold uppercase text-gray-400 pointer-events-none">Sampai</span>
                   <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 pt-4 pb-1.5 px-2.5 rounded-xl text-[10px] font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
              </div>

              {(searchQuery || startDate || endDate) && (
                <button 
                  onClick={() => {
                    setSearchQuery('');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-[10px] font-bold text-blue-600 flex items-center gap-1.5 hover:underline"
                >
                  <X className="w-3 h-3" /> Hapus Filter
                </button>
              )}
            </div>
            
            <div className="space-y-6 pb-10">
              {filteredDb.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 opacity-50">
                  <History className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-center text-gray-500 font-medium text-sm">Tidak ada catatan ditemukan</p>
                </div>
              )}
              
              <AnimatePresence>
              {sortedDates.map((date, dateIndex) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: dateIndex * 0.05 }}
                  key={date}
                  className="mb-6 last:mb-0"
                >
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    <h3 className="font-bold text-sm text-gray-700">
                      {format(new Date(date), 'dd MMMM yyyy', { locale: id })}
                    </h3>
                  </div>
                  
                  <div className="space-y-2">
                    {groupedHistory[date].reverse().map((t, index) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (dateIndex * 0.05) + (index * 0.02) }}
                        key={t.id} 
                        className="bg-white p-2.5 rounded-lg border border-gray-100 flex flex-col shadow-sm"
                      >
                        <div className="flex justify-between items-center w-full">
                          <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                            <span className={`w-7 h-7 flex items-center justify-center rounded-md text-[10px] font-bold text-white shadow-sm shrink-0 ${
                              t.user === 'Suami' ? 'bg-blue-500' : 'bg-pink-500'
                            }`}>
                              {t.user[0]}
                            </span>
                            <div className="flex flex-col min-w-0 pr-2">
                              <p className="font-bold text-gray-800 text-xs truncate">{t.desc}</p>
                              <p className="text-[9px] text-gray-400 font-bold uppercase mt-0 flex items-center gap-1.5 flex-wrap">
                                <span>{t.cat}</span>
                                {t.type === 'pengeluaran' && (
                                  <>
                                    <span>•</span>
                                    <span>{t.paymentMethod === 'kredit' ? 'KREDIT' : 'TUNAI'}</span>
                                    {t.paymentMethod === 'kredit' && (
                                      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black leading-none ${
                                        t.isPaid ? 'bg-green-150 text-green-700 bg-green-100' : 'bg-orange-100 text-orange-700'
                                      }`}>
                                        {t.isPaid ? 'LUNAS' : 'BELUM LUNAS'}
                                      </span>
                                    )}
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-black text-xs whitespace-nowrap hidden sm:block ${
                              t.type === 'pemasukan' ? 'text-green-600' : 'text-red-500'
                            }`}>
                              {t.type === 'pemasukan' ? '+' : '-'} {t.amt.toLocaleString('id-ID')}
                            </span>
                            <div className="flex items-center gap-1 border-l border-gray-100 pl-1.5 text-gray-500">
                              {t.type === 'pengeluaran' && t.paymentMethod === 'kredit' && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleToggleCreditPaid(t); }}
                                  className={`w-6 h-6 flex items-center justify-center rounded transition active:scale-95 ${
                                    t.isPaid ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-orange-50 text-orange-500 hover:bg-orange-100'
                                  }`}
                                  title={t.isPaid ? 'Tandai Belum Lunas' : 'Tandai Lunas'}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(t); }}
                                className="w-6 h-6 flex items-center justify-center bg-slate-50 text-blue-500 rounded transition hover:bg-blue-50 active:scale-95"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                                className="w-6 h-6 flex items-center justify-center bg-slate-50 text-red-500 rounded transition hover:bg-red-50 active:scale-95"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Mobile amount display below desc if screen is small */}
                        <div className="mt-1 pl-9 sm:hidden block">
                           <span className={`font-black text-[11px] whitespace-nowrap ${
                              t.type === 'pemasukan' ? 'text-green-600' : 'text-red-500'
                            }`}>
                             {t.type === 'pemasukan' ? '+' : '-'} {t.amt.toLocaleString('id-ID')}
                           </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* NAVIGATION */}
      <nav className="absolute bottom-0 w-full bg-white h-20 flex justify-around items-center border-t border-gray-100 pb-safe z-50 rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-2">
        <button 
          onClick={() => navigateToPage('home')} 
          className={`flex flex-col items-center justify-center w-[18%] h-full transition-colors ${
            activePage === 'home' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Home className={`w-[22px] h-[22px] mb-1 ${activePage === 'home' ? 'fill-blue-600/20' : ''}`} />
          <span className={`text-[9px] ${activePage === 'home' ? 'font-bold' : 'font-medium'}`}>Beranda</span>
        </button>
        
        <button 
          onClick={() => navigateToPage('report')} 
          className={`flex flex-col items-center justify-center w-[18%] h-full transition-colors ${
            activePage === 'report' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <FileText className={`w-[22px] h-[22px] mb-1 ${activePage === 'report' ? 'fill-blue-600/20' : ''}`} />
          <span className={`text-[9px] ${activePage === 'report' ? 'font-bold' : 'font-medium'}`}>Laporan</span>
        </button>
        
        <button 
          onClick={() => navigateToPage('add')} 
          className="flex flex-col items-center justify-center w-[20%] h-full -mt-6 group"
        >
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            className="bg-white rounded-full p-2 shadow-lg border border-blue-50"
          >
             <div className="bg-blue-600 rounded-full p-2.5">
               <PlusCircle className={`w-8 h-8 text-white`} />
             </div>
          </motion.div>
        </button>
        
        <button 
          onClick={() => navigateToPage('stats')} 
          className={`flex flex-col items-center justify-center w-[18%] h-full transition-colors ${
            activePage === 'stats' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <PieChart className={`w-[22px] h-[22px] mb-1 ${activePage === 'stats' ? 'fill-blue-600/20' : ''}`} />
          <span className={`text-[9px] ${activePage === 'stats' ? 'font-bold' : 'font-medium'}`}>Statistik</span>
        </button>

        <button 
          onClick={() => navigateToPage('history')} 
          className={`flex flex-col items-center justify-center w-[18%] h-full transition-colors ${
            activePage === 'history' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <History className={`w-[22px] h-[22px] mb-1 ${activePage === 'history' ? 'fill-blue-600/20' : ''}`} />
          <span className={`text-[9px] ${activePage === 'history' ? 'font-bold' : 'font-medium'}`}>Riwayat</span>
        </button>
      </nav>
      </div>
      {/* Edit Budget Modal */}
      <AnimatePresence>
        {isEditingBudget && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -10 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Mail className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Edit Anggaran</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Batas pengeluaran</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5 border border-indigo-100/50 p-4 rounded-2xl bg-indigo-50/50">
                <label className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Total Anggaran (Bulan ini)</label>
                <div className="flex items-center">
                  <span className="font-black text-xl text-indigo-300 mr-2">Rp</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tempBudget.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setTempBudget(val);
                    }}
                    className="w-full bg-transparent text-3xl font-black text-gray-800 focus:outline-none placeholder:text-gray-300"
                    placeholder="0"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button 
                  onClick={() => setIsEditingBudget(false)}
                  className="px-5 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSaveBudget}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-[0_4px_20px_rgba(79,70,229,0.3)]"
                >
                  Simpan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plan Modal */}
      <AnimatePresence>
        {showPlanModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -10 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <ListTodo className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{editingPlanId ? 'Edit Rencana' : 'Buat Rencana'}</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Perencanaan Pengeluaran</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Nama Rencana (misal: Beli Kulkas)"
                  value={planInput.name}
                  onChange={e => setPlanInput({...planInput, name: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input 
                  type="number" 
                  placeholder="Estimasi Biaya"
                  value={planInput.cost}
                  onChange={e => setPlanInput({...planInput, cost: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input 
                  type="date" 
                  value={planInput.date}
                  onChange={e => setPlanInput({...planInput, date: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => { setShowPlanModal(false); setEditingPlanId(null); setPlanInput({ name: '', cost: '', date: format(new Date(), 'yyyy-MM-dd') }); }}
                  className="px-5 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSavePlan}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg"
                >
                  Simpan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Savings Goal Modal */}
      <AnimatePresence>
        {showSavingsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -10 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <PiggyBank className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Target Tabungan</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Simpan uang untuk masa depan</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Nama Target (misal: DP Rumah)"
                  value={savingsInput.name}
                  onChange={e => setSavingsInput({...savingsInput, name: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input 
                  type="number" 
                  placeholder="Target Jumlah"
                  value={savingsInput.targetAmt}
                  onChange={e => setSavingsInput({...savingsInput, targetAmt: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input 
                  type="date" 
                  value={savingsInput.deadline}
                  onChange={e => setSavingsInput({...savingsInput, deadline: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setShowSavingsModal(false)}
                  className="px-5 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSaveSavingsGoal}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg"
                >
                  Buat Target
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Savings Amount Modal */}
      <AnimatePresence>
        {showAddSavingsAmtModal.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -10 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Tambah Saldo Tabungan</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Masukkan jumlah uang</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5 border border-indigo-100/50 p-4 rounded-2xl bg-indigo-50/50">
                <div className="flex items-center">
                  <span className="font-black text-xl text-indigo-300 mr-2">Rp</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={addSavingsAmt}
                    onChange={(e) => setAddSavingsAmt(e.target.value)}
                    className="w-full bg-transparent text-3xl font-black text-gray-800 focus:outline-none placeholder:text-gray-300"
                    placeholder="0"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button 
                  onClick={() => { setShowAddSavingsAmtModal({ show: false, goalId: null }); setAddSavingsAmt(''); }}
                  className="px-5 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleAddSavingsAmount}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg"
                >
                  Tambah
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear Data Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -10 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Hapus Semua Riwayat?</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Peringatan</p>
                </div>
              </div>
              
              <div className="p-4 rounded-2xl bg-red-50/50 border border-red-100/50">
                <p className="text-sm text-red-800">
                  Tindakan ini akan menghapus semua data transaksi Anda secara permanen. Apakah Anda yakin ingin melanjutkan?
                </p>
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="px-5 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={executeClearData}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-[0_4px_20px_rgba(220,38,38,0.3)]"
                >
                  Hapus Semua
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {importStatus.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl p-6 w-full max-w-sm flex flex-col gap-6"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 ${importStatus.type === 'error' ? 'bg-red-100/50 text-red-600' : 'bg-green-100/50 text-green-600'} rounded-2xl flex items-center justify-center`}>
                  {importStatus.type === 'error' ? <X className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">
                    {importStatus.type === 'error' ? 'Gagal Impor' : importStatus.type === 'success' ? 'Sukses' : 'Konfirmasi Impor'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Pemberitahuan</p>
                </div>
              </div>
              
              <div className={`p-4 rounded-2xl ${importStatus.type === 'error' ? 'bg-red-50/50 border border-red-100/50 text-red-800' : 'bg-gray-50 border border-gray-100 text-gray-600'}`}>
                <p className="text-sm whitespace-pre-wrap">
                  {importStatus.msg}
                </p>
              </div>

              <div className="flex gap-3 justify-end mt-2">
                {importStatus.type === 'confirm' ? (
                  <>
                    <button 
                      onClick={() => setImportStatus({show: false, type: 'success', msg: '', data: []})}
                      className="px-5 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Batal
                    </button>
                    <button 
                      onClick={handleExecuteImport}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)]"
                    >
                      Lanjutkan
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setImportStatus({show: false, type: 'success', msg: '', data: []})}
                    className="px-6 py-3 bg-gray-900 hover:bg-gray-800 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-lg"
                  >
                    Tutup
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

