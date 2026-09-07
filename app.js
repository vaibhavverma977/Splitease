// ============================
//  SplitEase - app.js (v1.4)
//  Offline-first expense splitting
//  Multi-payer support, mobile responsive fix
// ============================

// ---- DATA LAYER ----

const STORAGE_KEY = 'splitEaseData';

let groups = [];
let currentGroupId = null;
let editingExpenseId = null;
let currentStatusFilter = 'open'; // 'open' or 'settled'
let currentTab = 'members'; // track active tab

// Currency symbols and names
const CURRENCIES = {
    INR: { symbol: '₹', name: 'Indian Rupee' },
    USD: { symbol: '$', name: 'US Dollar' },
    EUR: { symbol: '€', name: 'Euro' },
    GBP: { symbol: '£', name: 'British Pound' },
    AED: { symbol: 'د.إ', name: 'UAE Dirham' },
    JPY: { symbol: '¥', name: 'Japanese Yen' },
    CAD: { symbol: 'C$', name: 'Canadian Dollar' },
    AUD: { symbol: 'A$', name: 'Australian Dollar' },
    SGD: { symbol: 'S$', name: 'Singapore Dollar' }
};

function getCurrencySymbol(code) {
    return CURRENCIES[code]?.symbol || code;
}

// Load data from localStorage
function loadData() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                groups = parsed;
                // Ensure each group has required properties
                groups.forEach(g => {
                    if (!g.status) g.status = 'open';
                    if (g.settledAt === undefined) g.settledAt = null;
                    if (!g.paymentStatus) g.paymentStatus = {};
                    if (!g.baseCurrency) g.baseCurrency = 'INR';
                    // Convert old single-payer expenses to payers array
                    if (g.expenses) {
                        g.expenses.forEach(exp => {
                            if (!exp.payers && exp.payer) {
                                // Convert single payer to payers array
                                const amt = exp.originalAmount || exp.amount;
                                exp.payers = [{ member: exp.payer, amount: amt }];
                                // Remove old payer field to avoid confusion, but keep for backward compatibility if needed
                                // We'll keep it but ignore if payers exists.
                            }
                            if (!exp.payers) {
                                // Fallback: if no payers and no payer, set empty array? but shouldn't happen.
                                exp.payers = [];
                            }
                        });
                    }
                });
                return;
            }
        } catch (_) {}
    }
    groups = [];
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Helper: format date for display
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getToday() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

function formatCurrency(amount, currencyCode = 'INR') {
    const symbol = getCurrencySymbol(currencyCode);
    return `${symbol}${amount.toFixed(2)}`;
}

// ---- VIEWS / NAVIGATION ----

function showHomeView() {
    document.getElementById('home-view').classList.add('active');
    document.getElementById('group-view').classList.remove('active');
    currentGroupId = null;
    renderHome();
}

function showGroupView(groupId) {
    document.getElementById('home-view').classList.remove('active');
    document.getElementById('group-view').classList.add('active');
    currentGroupId = groupId;
    currentTab = 'members';
    renderGroup(groupId);
}

// ---- RENDER HOME ----

function renderHome() {
    const container = document.getElementById('groups-list');
    const emptyState = document.getElementById('empty-state');
    const emptyTitle = document.getElementById('empty-title');
    const emptyDesc = document.getElementById('empty-desc');
    container.innerHTML = '';

    const filtered = groups.filter(g => (g.status || 'open') === currentStatusFilter);

    if (filtered.length === 0) {
        emptyState.style.display = 'block';
        if (currentStatusFilter === 'open') {
            emptyTitle.textContent = 'No active trips yet';
            emptyDesc.textContent = 'Create your first group to start splitting expenses.';
        } else {
            emptyTitle.textContent = 'No completed trips yet';
            emptyDesc.textContent = 'Settled trips will appear here.';
        }
        return;
    }
    emptyState.style.display = 'none';

    filtered.forEach(group => {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.dataset.id = group.id;

        const info = document.createElement('div');
        info.className = 'group-card-info';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-card-name';
        nameSpan.textContent = group.name;
        const metaSpan = document.createElement('span');
        metaSpan.className = 'group-card-meta';
        const memberCount = group.members ? group.members.length : 0;
        let totalSpent = 0;
        if (group.expenses) {
            group.expenses.forEach(e => {
                totalSpent += (e.baseAmount !== undefined ? e.baseAmount : e.amount);
            });
        }
        let metaText = `${memberCount} members · ${formatCurrency(totalSpent, group.baseCurrency || 'INR')} spent`;
        if (group.status === 'settled' && group.settledAt) {
            metaText += ` · Settled ${formatDateTime(group.settledAt)}`;
            const badge = document.createElement('span');
            badge.className = 'settled-badge';
            badge.textContent = '✓ Settled';
            metaSpan.appendChild(document.createTextNode(metaText));
            metaSpan.appendChild(badge);
        } else {
            metaSpan.textContent = metaText;
        }

        info.appendChild(nameSpan);
        info.appendChild(metaSpan);

        const arrow = document.createElement('span');
        arrow.className = 'group-card-arrow';
        arrow.textContent = '›';

        card.appendChild(info);
        card.appendChild(arrow);

        card.addEventListener('click', () => {
            showGroupView(group.id);
        });

        container.appendChild(card);
    });
}

// ---- RENDER GROUP ----

function renderGroup(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) {
        showHomeView();
        return;
    }

    document.getElementById('group-title').textContent = group.name;
    const currencyBtn = document.getElementById('btn-change-currency');
    currencyBtn.textContent = getCurrencySymbol(group.baseCurrency || 'INR');

    renderGroupStatusAction(group);
    renderMembers(group);
    renderExpenses(group);
    renderOverview(group);
    renderBalances(group);
    populateExpenseModal(group);
    switchTab(currentTab);
}

// ---- GROUP STATUS ACTION ----

function renderGroupStatusAction(group) {
    const container = document.getElementById('group-status-action');
    container.innerHTML = '';

    if (group.status === 'open') {
        const btn = document.createElement('button');
        btn.className = 'status-btn-action settle-btn';
        btn.textContent = 'Mark Trip as Settled';
        btn.addEventListener('click', () => {
            if (confirm('Mark this trip as settled?\n\nThe trip will be moved to History and can be reopened later.')) {
                markGroupSettled(group.id);
            }
        });
        container.appendChild(btn);
    } else {
        const btn = document.createElement('button');
        btn.className = 'status-btn-action reopen-btn';
        btn.textContent = 'Reopen Trip';
        btn.addEventListener('click', () => {
            if (confirm('Reopen this settled trip?\n\nIt will be moved back to Open trips.')) {
                reopenGroup(group.id);
            }
        });
        container.appendChild(btn);
    }
}

function markGroupSettled(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    group.status = 'settled';
    group.settledAt = new Date().toISOString();
    saveData();
    showHomeView();
}

function reopenGroup(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    group.status = 'open';
    group.settledAt = null;
    saveData();
    showHomeView();
}

// ---- MEMBERS TAB ----

function renderMembers(group) {
    const container = document.getElementById('members-list');
    container.innerHTML = '';

    if (!group.members || group.members.length === 0) {
        container.innerHTML = '<div class="empty-state small"><span class="empty-icon">👤</span><p>No members yet. Add one below.</p></div>';
        return;
    }

    group.members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'member-item';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'member-item-name';
        nameSpan.textContent = member;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-member-btn';
        removeBtn.textContent = '✕';
        removeBtn.setAttribute('aria-label', 'Remove member');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeMember(group.id, member);
        });

        item.appendChild(nameSpan);
        item.appendChild(removeBtn);
        container.appendChild(item);
    });
}

function addMember() {
    const input = document.getElementById('input-member-name');
    const name = input.value.trim();
    const errorEl = document.getElementById('member-error');

    if (!name) {
        errorEl.textContent = 'Please enter a name.';
        errorEl.classList.remove('hidden');
        return;
    }

    const group = groups.find(g => g.id === currentGroupId);
    if (!group) return;

    if (group.members && group.members.some(m => m.toLowerCase() === name.toLowerCase())) {
        errorEl.textContent = 'Duplicate member name.';
        errorEl.classList.remove('hidden');
        return;
    }

    errorEl.classList.add('hidden');
    if (!group.members) group.members = [];
    group.members.push(name);
    saveData();
    renderGroup(currentGroupId);
    input.value = '';
}

function removeMember(groupId, memberName) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const isUsed = group.expenses.some(exp => {
        // Check if member appears in payers or splits
        if (exp.payers && exp.payers.some(p => p.member === memberName)) return true;
        if (exp.payer === memberName) return true;
        if (exp.splitType === 'equal') {
            return (exp.included || []).includes(memberName);
        } else {
            return exp.splits && exp.splits[memberName] !== undefined;
        }
    });

    if (isUsed) {
        alert('This member is used in existing expenses. Remove or edit those expenses first.');
        return;
    }

    group.members = group.members.filter(m => m !== memberName);
    saveData();
    renderGroup(groupId);
}

// ---- EXPENSES TAB ----

function renderExpenses(group) {
    const container = document.getElementById('expenses-list');
    const empty = document.getElementById('expense-empty');
    container.innerHTML = '';

    if (!group.expenses || group.expenses.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    const sorted = [...group.expenses].sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (b.id || '').localeCompare(a.id || '');
    });

    sorted.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'expense-item';

        const info = document.createElement('div');
        info.className = 'expense-info';

        const desc = document.createElement('div');
        desc.className = 'expense-desc';
        desc.textContent = exp.description;

        const details = document.createElement('div');
        details.className = 'expense-details';
        // Show payers summary
        let payerStr = '';
        if (exp.payers && exp.payers.length > 0) {
            const payerNames = exp.payers.map(p => p.member).join(', ');
            payerStr = `Paid by ${payerNames}`;
        } else if (exp.payer) {
            payerStr = `Paid by ${exp.payer}`;
        } else {
            payerStr = 'Paid by unknown';
        }
        const dateStr = exp.date ? formatDate(exp.date) : '';
        const datePart = dateStr ? ` · ${dateStr}` : '';
        let splitTypeLabel = 'Equal';
        if (exp.splitType === 'percentage') splitTypeLabel = 'Percentage';
        else if (exp.splitType === 'custom') splitTypeLabel = 'Custom';

        let amountDisplay = '';
        if (exp.originalCurrency && exp.originalCurrency !== group.baseCurrency) {
            const origSym = getCurrencySymbol(exp.originalCurrency);
            amountDisplay = `${origSym}${Number(exp.originalAmount).toFixed(2)} (${formatCurrency(exp.baseAmount || exp.amount, group.baseCurrency || 'INR')})`;
        } else {
            amountDisplay = formatCurrency(exp.amount, group.baseCurrency || 'INR');
        }

        details.innerHTML = `
            <span>${payerStr}${datePart}</span>
            <span class="split-type-badge">${splitTypeLabel}</span>
        `;

        info.appendChild(desc);
        info.appendChild(details);

        const amountSpan = document.createElement('span');
        amountSpan.className = 'expense-amount';
        amountSpan.textContent = amountDisplay;

        const actions = document.createElement('div');
        actions.className = 'expense-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✎';
        editBtn.setAttribute('aria-label', 'Edit expense');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditExpenseModal(group.id, exp.id);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.setAttribute('aria-label', 'Delete expense');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this expense?')) {
                deleteExpense(group.id, exp.id);
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.alignItems = 'center';
        rightSide.style.gap = '8px';
        rightSide.appendChild(amountSpan);
        rightSide.appendChild(actions);

        item.appendChild(info);
        item.appendChild(rightSide);
        container.appendChild(item);
    });
}

function openEditExpenseModal(groupId, expenseId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const expense = group.expenses.find(e => e.id === expenseId);
    if (!expense) return;

    editingExpenseId = expenseId;
    document.getElementById('expense-modal-title').textContent = 'Edit Expense';
    document.getElementById('btn-confirm-expense').textContent = 'Update Expense';

    // Fill fields
    document.getElementById('input-expense-desc').value = expense.description || '';
    document.getElementById('input-expense-amount').value = expense.originalAmount || expense.amount || '';
    document.getElementById('input-expense-date').value = expense.date || getToday();
    document.getElementById('input-expense-notes').value = expense.notes || '';

    // Currency
    const currencySelect = document.getElementById('input-expense-currency');
    const expCurrency = expense.originalCurrency || 'INR';
    currencySelect.value = expCurrency;
    const baseCurrency = group.baseCurrency || 'INR';
    if (expCurrency !== baseCurrency) {
        document.getElementById('exchange-rate-group').style.display = 'block';
        document.getElementById('input-exchange-rate').value = expense.exchangeRate || 1;
        updateConvertedAmountDisplay(baseCurrency, expCurrency);
    } else {
        document.getElementById('exchange-rate-group').style.display = 'none';
    }

    // Populate payers
    const payers = expense.payers || (expense.payer ? [{ member: expense.payer, amount: expense.originalAmount || expense.amount }] : []);
    renderPayerRows(group, payers);

    // Included checkboxes
    const includedMembers = expense.included || [];
    const checkboxes = document.querySelectorAll('#expense-included-list input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = includedMembers.includes(cb.value);
    });

    // Split type
    const splitType = expense.splitType || 'equal';
    document.getElementById('input-split-type').value = splitType;

    // Render split inputs based on split type and data
    renderSplitInputs(group, expense);

    // Show the modal
    openModal('modal-add-expense');
}

// ---- PAYER ROWS ----

function renderPayerRows(group, existingPayers) {
    const container = document.getElementById('payers-container');
    container.innerHTML = '';
    const members = group.members || [];

    // If no existing payers, create one default row
    if (!existingPayers || existingPayers.length === 0) {
        existingPayers = [{ member: members.length > 0 ? members[0] : '', amount: '' }];
    }

    existingPayers.forEach((payer, index) => {
        const row = document.createElement('div');
        row.className = 'payer-row';
        row.dataset.index = index;

        const select = document.createElement('select');
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = 'Select member';
        select.appendChild(emptyOpt);
        members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === payer.member) opt.selected = true;
            select.appendChild(opt);
        });
        // Disable already selected members in other rows
        select.addEventListener('change', () => {
            updatePayerRows(group);
        });

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0';
        input.placeholder = 'Amount';
        input.value = payer.amount !== undefined ? payer.amount : '';
        input.addEventListener('input', () => {
            updatePayerSummary(group);
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-payer';
        removeBtn.textContent = '✕';
        removeBtn.setAttribute('aria-label', 'Remove payer');
        if (existingPayers.length === 1) {
            removeBtn.style.visibility = 'hidden';
        } else {
            removeBtn.addEventListener('click', () => {
                container.removeChild(row);
                updatePayerRows(group);
                updatePayerSummary(group);
            });
        }

        row.appendChild(select);
        row.appendChild(input);
        row.appendChild(removeBtn);
        container.appendChild(row);
    });

    // Update select options to prevent duplicates
    updatePayerRows(group);
    updatePayerSummary(group);
}

function updatePayerRows(group) {
    // Update each select to exclude members already used in other rows
    const rows = document.querySelectorAll('.payer-row');
    const selectedMembers = [];
    rows.forEach(row => {
        const select = row.querySelector('select');
        const currentVal = select.value;
        if (currentVal) selectedMembers.push(currentVal);
    });

    rows.forEach(row => {
        const select = row.querySelector('select');
        const currentVal = select.value;
        // Keep options
        const options = select.querySelectorAll('option');
        options.forEach(opt => {
            if (opt.value === '') {
                opt.disabled = false;
                return;
            }
            // Disable if selected in another row and not the current row's value
            if (selectedMembers.filter(v => v === opt.value).length > 1 && opt.value !== currentVal) {
                opt.disabled = true;
            } else {
                opt.disabled = false;
            }
        });
    });
}

function updatePayerSummary(group) {
    const container = document.getElementById('payers-container');
    const rows = container.querySelectorAll('.payer-row');
    const summaryEl = document.getElementById('payer-summary');
    const amountInput = document.getElementById('input-expense-amount');
    const totalExpense = parseFloat(amountInput.value) || 0;
    const currency = document.getElementById('input-expense-currency').value;

    let allocated = 0;
    rows.forEach(row => {
        const input = row.querySelector('input');
        const val = parseFloat(input.value);
        if (!isNaN(val) && val > 0) {
            allocated += val;
        }
    });

    const remaining = totalExpense - allocated;

    if (totalExpense > 0) {
        summaryEl.classList.remove('hidden');
        const remainingClass = Math.abs(remaining) < 0.001 ? 'valid' : 'invalid';
        summaryEl.innerHTML = `
            <div class="summary-line">
                <span class="label">Expense Total:</span>
                <span class="value">${formatCurrency(totalExpense, currency)}</span>
            </div>
            <div class="summary-line">
                <span class="label">Paid by members:</span>
                <span class="value">${formatCurrency(allocated, currency)}</span>
            </div>
            <div class="summary-line remaining ${remainingClass}">
                <span class="label">Remaining:</span>
                <span class="value">${formatCurrency(remaining, currency)}</span>
            </div>
        `;
        // Show validation message in split-error if not matching
        const errorEl = document.getElementById('split-error');
        if (Math.abs(remaining) > 0.001) {
            errorEl.textContent = `Payer amounts must equal the expense total (${formatCurrency(totalExpense, currency)}).`;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden');
        }
    } else {
        summaryEl.classList.add('hidden');
        document.getElementById('split-error').classList.add('hidden');
    }
}

// ---- ADD/EDIT EXPENSE ----

function addExpense() {
    const descInput = document.getElementById('input-expense-desc');
    const amountInput = document.getElementById('input-expense-amount');
    const currencySelect = document.getElementById('input-expense-currency');
    const exchangeRateInput = document.getElementById('input-exchange-rate');
    const dateInput = document.getElementById('input-expense-date');
    const splitTypeSelect = document.getElementById('input-split-type');
    const notesInput = document.getElementById('input-expense-notes');
    const checkboxes = document.querySelectorAll('#expense-included-list input[type="checkbox"]');
    const errorEl = document.getElementById('split-error');

    const description = descInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const currency = currencySelect.value;
    const date = dateInput.value || getToday();
    const splitType = splitTypeSelect.value;
    const notes = notesInput.value.trim();

    const included = [];
    checkboxes.forEach(cb => {
        if (cb.checked) included.push(cb.value);
    });

    // Basic validations
    if (!description) {
        errorEl.textContent = 'Please enter a description.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        errorEl.textContent = 'Please enter a valid positive amount.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (included.length === 0) {
        errorEl.textContent = 'Please select at least one person included.';
        errorEl.classList.remove('hidden');
        return;
    }

    const group = groups.find(g => g.id === currentGroupId);
    if (!group) return;

    const baseCurrency = group.baseCurrency || 'INR';
    let exchangeRate = 1;
    let baseAmount = amount;
    let originalAmount = amount;
    let originalCurrency = currency;

    if (currency !== baseCurrency) {
        const rate = parseFloat(exchangeRateInput.value);
        if (isNaN(rate) || rate <= 0) {
            errorEl.textContent = 'Please enter a valid exchange rate.';
            errorEl.classList.remove('hidden');
            return;
        }
        exchangeRate = rate;
        baseAmount = amount * rate;
        originalAmount = amount;
        originalCurrency = currency;
    }

    // Read payer rows
    const payerRows = document.querySelectorAll('.payer-row');
    const payers = [];
    let payerTotal = 0;
    payerRows.forEach(row => {
        const select = row.querySelector('select');
        const input = row.querySelector('input');
        const member = select.value;
        const amt = parseFloat(input.value);
        if (member && !isNaN(amt) && amt >= 0) {
            payers.push({ member, amount: amt });
            payerTotal += amt;
        }
    });

    // Validate payer total equals expense amount
    if (Math.abs(payerTotal - amount) > 0.001) {
        errorEl.textContent = `Payer amounts (${formatCurrency(payerTotal, currency)}) must equal the expense total (${formatCurrency(amount, currency)}).`;
        errorEl.classList.remove('hidden');
        return;
    }

    if (payers.length === 0) {
        errorEl.textContent = 'Please add at least one payer.';
        errorEl.classList.remove('hidden');
        return;
    }

    // Build expense object
    let expenseData = {
        description,
        amount: baseAmount,
        date,
        splitType,
        notes,
        originalCurrency,
        originalAmount,
        exchangeRate,
        baseAmount,
        payers: payers.map(p => ({ member: p.member, amount: p.amount }))
    };

    // Handle split type
    if (splitType === 'equal') {
        expenseData.included = included;
    } else {
        // Read split inputs
        const splitInputs = document.querySelectorAll('.split-input-row');
        const splits = {};
        let total = 0;
        let valid = true;
        let errorMsg = '';

        splitInputs.forEach(row => {
            const member = row.dataset.member;
            const input = row.querySelector('input');
            const val = parseFloat(input.value);
            if (!isNaN(val) && val >= 0) {
                splits[member] = val;
                total += val;
            } else {
                valid = false;
                errorMsg = `Invalid value for ${member}.`;
            }
        });

        if (!valid) {
            errorEl.textContent = errorMsg;
            errorEl.classList.remove('hidden');
            return;
        }

        if (splitType === 'percentage') {
            if (Math.abs(total - 100) > 0.001) {
                errorEl.textContent = `Total percentage must equal 100% (current: ${total.toFixed(2)}%)`;
                errorEl.classList.remove('hidden');
                return;
            }
            if (Object.values(splits).every(v => v === 0)) {
                errorEl.textContent = 'At least one person must have a positive percentage.';
                errorEl.classList.remove('hidden');
                return;
            }
            expenseData.splits = splits;
        } else if (splitType === 'custom') {
            // Custom amounts are in the original currency? Actually we use the same as split inputs: they are in expense currency.
            // But we need to validate against originalAmount.
            if (Math.abs(total - originalAmount) > 0.001) {
                errorEl.textContent = `Total custom amounts (${formatCurrency(total, currency)}) must equal expense amount (${formatCurrency(originalAmount, currency)}).`;
                errorEl.classList.remove('hidden');
                return;
            }
            if (Object.values(splits).every(v => v === 0)) {
                errorEl.textContent = 'At least one person must have a positive amount.';
                errorEl.classList.remove('hidden');
                return;
            }
            expenseData.splits = splits;
        }
    }

    errorEl.classList.add('hidden');

    if (editingExpenseId) {
        const index = group.expenses.findIndex(e => e.id === editingExpenseId);
        if (index !== -1) {
            const oldExp = group.expenses[index];
            expenseData.id = oldExp.id;
            const updated = { ...oldExp, ...expenseData };
            group.expenses[index] = updated;
        }
        editingExpenseId = null;
    } else {
        expenseData.id = generateId();
        if (!group.expenses) group.expenses = [];
        group.expenses.push(expenseData);
    }

    saveData();
    closeModal('modal-add-expense');
    renderGroup(currentGroupId);
}

function deleteExpense(groupId, expenseId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    group.expenses = group.expenses.filter(e => e.id !== expenseId);
    saveData();
    renderGroup(groupId);
}

// ---- OVERVIEW TAB ----

function renderOverview(group) {
    const container = document.getElementById('pie-chart');
    const legendContainer = document.getElementById('chart-legend');
    const breakdownContainer = document.getElementById('member-breakdown');
    const totalSpan = document.getElementById('total-spending');
    const empty = document.getElementById('overview-empty');

    const spending = calculateSpendingByMember(group);
    const total = Object.values(spending).reduce((sum, val) => sum + val, 0);
    const baseCurrency = group.baseCurrency || 'INR';
    totalSpan.textContent = formatCurrency(total, baseCurrency);

    if (total === 0 || !group.members || group.members.length === 0) {
        empty.style.display = 'block';
        container.innerHTML = '';
        legendContainer.innerHTML = '';
        breakdownContainer.innerHTML = '';
        return;
    }
    empty.style.display = 'none';

    const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const membersWithSpending = group.members.filter(m => spending[m] && spending[m] > 0);
    const totalSpending = total;

    const slices = membersWithSpending.map((member, index) => {
        const value = spending[member];
        const percentage = (value / totalSpending) * 100;
        const color = colors[index % colors.length];
        return { member, value, percentage, color };
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.style.width = '100%';
    svg.style.height = '100%';

    let startAngle = -90;
    slices.forEach(slice => {
        const angle = (slice.percentage / 100) * 360;
        const endAngle = startAngle + angle;
        const radStart = (startAngle * Math.PI) / 180;
        const radEnd = (endAngle * Math.PI) / 180;
        const x1 = 50 + 40 * Math.cos(radStart);
        const y1 = 50 + 40 * Math.sin(radStart);
        const x2 = 50 + 40 * Math.cos(radEnd);
        const y2 = 50 + 40 * Math.sin(radEnd);
        const largeArc = angle > 180 ? 1 : 0;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;
        path.setAttribute('d', d);
        path.setAttribute('fill', slice.color);
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '1');
        svg.appendChild(path);
        startAngle = endAngle;
    });

    const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerCircle.setAttribute('cx', '50');
    centerCircle.setAttribute('cy', '50');
    centerCircle.setAttribute('r', '20');
    centerCircle.setAttribute('fill', '#ffffff');
    svg.appendChild(centerCircle);

    container.innerHTML = '';
    container.appendChild(svg);

    legendContainer.innerHTML = '';
    slices.forEach(slice => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const colorBox = document.createElement('span');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = slice.color;
        const label = document.createElement('span');
        label.textContent = `${slice.member} (${formatCurrency(slice.value, baseCurrency)})`;
        item.appendChild(colorBox);
        item.appendChild(label);
        legendContainer.appendChild(item);
    });

    breakdownContainer.innerHTML = '';
    group.members.forEach(member => {
        const amount = spending[member] || 0;
        const percent = total > 0 ? (amount / total) * 100 : 0;
        const item = document.createElement('div');
        item.className = 'breakdown-item';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = member;
        const amountSpan = document.createElement('span');
        amountSpan.className = 'amount';
        amountSpan.textContent = formatCurrency(amount, baseCurrency);
        const percentSpan = document.createElement('span');
        percentSpan.className = 'percent';
        percentSpan.textContent = `${percent.toFixed(1)}%`;
        item.appendChild(nameSpan);
        const right = document.createElement('span');
        right.appendChild(amountSpan);
        right.appendChild(document.createTextNode(' '));
        right.appendChild(percentSpan);
        item.appendChild(right);
        breakdownContainer.appendChild(item);
    });
}

// ---- BALANCES TAB ----

function renderBalances(group) {
    const container = document.getElementById('balances-summary');
    const settlementContainer = document.getElementById('settlement-list');
    container.innerHTML = '';
    settlementContainer.innerHTML = '';

    if (!group.members || group.members.length === 0) {
        container.innerHTML = '<div class="empty-state small"><span class="empty-icon">⚖️</span><p>Add members to see balances.</p></div>';
        settlementContainer.innerHTML = '';
        return;
    }

    const balances = calculateBalances(group);
    const baseCurrency = group.baseCurrency || 'INR';

    let totalToReceive = 0, totalToPay = 0, pendingCount = 0;
    const settlement = calculateSettlement(group);
    pendingCount = settlement.length;

    group.members.forEach(m => {
        const net = balances[m]?.net || 0;
        if (net > 0.005) totalToReceive += net;
        else if (net < -0.005) totalToPay += Math.abs(net);
    });

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'balance-summary-top';
    summaryDiv.innerHTML = `
        <div class="summary-item">
            <div class="summary-label">Total to receive</div>
            <div class="summary-value" style="color:#16a34a;">${formatCurrency(totalToReceive, baseCurrency)}</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">Total to pay</div>
            <div class="summary-value" style="color:#dc2626;">${formatCurrency(totalToPay, baseCurrency)}</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">Pending settlements</div>
            <div class="summary-value">${pendingCount}</div>
        </div>
    `;
    container.appendChild(summaryDiv);

    const sortedMembers = [...group.members].sort((a, b) => {
        return (balances[b]?.net || 0) - (balances[a]?.net || 0);
    });

    sortedMembers.forEach(member => {
        const data = balances[member];
        if (!data) return;
        const item = document.createElement('div');
        item.className = 'balance-item';

        const row = document.createElement('div');
        row.className = 'balance-row';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = member;

        const netSpan = document.createElement('span');
        netSpan.className = 'net';
        const netValue = data.net;
        if (netValue > 0.005) {
            netSpan.classList.add('positive');
            netSpan.textContent = `+${formatCurrency(netValue, baseCurrency)}`;
        } else if (netValue < -0.005) {
            netSpan.classList.add('negative');
            netSpan.textContent = `-${formatCurrency(Math.abs(netValue), baseCurrency)}`;
        } else {
            netSpan.classList.add('zero');
            netSpan.textContent = formatCurrency(0, baseCurrency);
        }

        row.appendChild(nameSpan);
        row.appendChild(netSpan);

        const details = document.createElement('div');
        details.className = 'balance-details';
        details.innerHTML = `
            <span>Paid: ${formatCurrency(data.paid, baseCurrency)}</span>
            <span>Share: ${formatCurrency(data.share, baseCurrency)}</span>
        `;

        const action = document.createElement('div');
        action.className = 'balance-action';
        if (netValue > 0.005) {
            action.classList.add('positive');
            action.textContent = `Will receive: ${formatCurrency(netValue, baseCurrency)}`;
        } else if (netValue < -0.005) {
            action.classList.add('negative');
            action.textContent = `Needs to pay: ${formatCurrency(Math.abs(netValue), baseCurrency)}`;
        } else {
            action.classList.add('zero');
            action.textContent = 'Settled';
        }

        item.appendChild(row);
        item.appendChild(details);
        item.appendChild(action);
        container.appendChild(item);
    });

    if (settlement.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'settlement-item';
        msg.textContent = 'All settled! 🎉';
        settlementContainer.appendChild(msg);
    } else {
        if (!group.paymentStatus) group.paymentStatus = {};

        settlement.forEach((s) => {
            const key = `settlement_${s.from}_${s.to}_${s.amount.toFixed(2)}`;
            const isPaid = group.paymentStatus[key] === true;

            const item = document.createElement('div');
            item.className = 'settlement-item';

            const left = document.createElement('span');
            left.className = 'from-to';
            left.textContent = `${s.from} pays ${s.to}`;

            const right = document.createElement('span');
            right.style.display = 'flex';
            right.style.alignItems = 'center';
            right.style.gap = '12px';

            const amountSpan = document.createElement('span');
            amountSpan.className = 'amount';
            amountSpan.textContent = formatCurrency(s.amount, baseCurrency);

            const statusDiv = document.createElement('span');
            statusDiv.className = 'payment-status';

            if (isPaid) {
                const badge = document.createElement('span');
                badge.className = 'paid-badge';
                badge.textContent = '✓ Paid';
                statusDiv.appendChild(badge);

                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'paid-toggle';
                toggleBtn.textContent = 'Unmark';
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    togglePayment(group.id, key);
                });
                statusDiv.appendChild(toggleBtn);
            } else {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'paid-toggle unpaid';
                toggleBtn.textContent = 'Mark as Paid';
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    togglePayment(group.id, key);
                });
                statusDiv.appendChild(toggleBtn);
            }

            right.appendChild(amountSpan);
            right.appendChild(statusDiv);

            item.appendChild(left);
            item.appendChild(right);
            settlementContainer.appendChild(item);
        });
    }
}

// ---- TOGGLE PAYMENT STATUS ----

function togglePayment(groupId, key) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    if (!group.paymentStatus) group.paymentStatus = {};

    group.paymentStatus[key] = !group.paymentStatus[key];
    saveData();
    currentTab = 'balances';
    renderGroup(groupId);
}

// ---- CALCULATION FUNCTIONS ----

function calculateExpenseShares(expense) {
    const amount = expense.baseAmount !== undefined ? expense.baseAmount : expense.amount;
    const splitType = expense.splitType || 'equal';
    let shares = {};

    if (splitType === 'equal') {
        const included = expense.included || [];
        if (included.length === 0) return {};
        const perPerson = amount / included.length;
        included.forEach(person => {
            shares[person] = perPerson;
        });
    } else if (splitType === 'percentage') {
        const splits = expense.splits || {};
        const totalPct = Object.values(splits).reduce((a, b) => a + b, 0);
        if (totalPct === 0) return {};
        Object.keys(splits).forEach(person => {
            shares[person] = (splits[person] / totalPct) * amount;
        });
    } else if (splitType === 'custom') {
        const splits = expense.splits || {};
        const exchangeRate = expense.exchangeRate || 1;
        Object.keys(splits).forEach(person => {
            shares[person] = splits[person] * exchangeRate;
        });
    }

    return shares;
}

function calculateBalances(group) {
    const balances = {};
    if (group.members) {
        group.members.forEach(m => {
            balances[m] = { paid: 0, share: 0, net: 0 };
        });
    }

    if (!group.expenses) return balances;

    group.expenses.forEach(exp => {
        // Calculate total paid per member from payers
        const payers = exp.payers || [];
        payers.forEach(p => {
            const member = p.member;
            const amt = p.amount * (exp.exchangeRate || 1); // Convert to base currency
            if (balances[member]) {
                balances[member].paid += amt;
            }
        });

        // Calculate shares (using existing logic)
        const shares = calculateExpenseShares(exp);
        Object.keys(shares).forEach(person => {
            if (balances[person]) {
                balances[person].share += shares[person];
            }
        });
    });

    Object.keys(balances).forEach(m => {
        balances[m].net = balances[m].paid - balances[m].share;
    });

    return balances;
}

function calculateSettlement(group) {
    const balances = calculateBalances(group);
    const members = group.members || [];
    const creditors = [];
    const debtors = [];
    members.forEach(m => {
        const net = balances[m]?.net || 0;
        if (net > 0.005) {
            creditors.push({ name: m, amount: net });
        } else if (net < -0.005) {
            debtors.push({ name: m, amount: -net });
        }
    });

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const settlements = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];
        const amount = Math.min(debtor.amount, creditor.amount);
        if (amount > 0.005) {
            settlements.push({
                from: debtor.name,
                to: creditor.name,
                amount: amount
            });
        }
        debtor.amount -= amount;
        creditor.amount -= amount;
        if (debtor.amount < 0.005) i++;
        if (creditor.amount < 0.005) j++;
    }

    return settlements;
}

function calculateSpendingByMember(group) {
    const spending = {};
    if (group.members) {
        group.members.forEach(m => spending[m] = 0);
    }
    if (!group.expenses) return spending;

    group.expenses.forEach(exp => {
        const payers = exp.payers || [];
        payers.forEach(p => {
            const amount = p.amount * (exp.exchangeRate || 1);
            if (spending[p.member] !== undefined) {
                spending[p.member] += amount;
            }
        });
    });

    return spending;
}

// ---- CURRENCY EXCHANGE RATE UI ----

function updateConvertedAmountDisplay(baseCurrency, expCurrency) {
    const amountInput = document.getElementById('input-expense-amount');
    const rateInput = document.getElementById('input-exchange-rate');
    const display = document.getElementById('converted-amount-display');
    const amount = parseFloat(amountInput.value);
    const rate = parseFloat(rateInput.value);
    if (!isNaN(amount) && !isNaN(rate) && rate > 0) {
        const converted = amount * rate;
        display.textContent = `= ${formatCurrency(converted, baseCurrency)}`;
        display.style.display = 'block';
    } else {
        display.textContent = '';
        display.style.display = 'none';
    }
}

// ---- POPULATE EXPENSE MODAL (for new expense) ----

function populateExpenseModal(group) {
    // Included people checkboxes
    const includedContainer = document.getElementById('expense-included-list');
    includedContainer.innerHTML = '';

    const members = group.members || [];
    if (members.length === 0) {
        includedContainer.innerHTML = '<span style="font-size:13px;color:#94a3b8;">Add members first</span>';
        return;
    }

    members.forEach(m => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = m;
        cb.checked = true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(m));
        includedContainer.appendChild(label);
    });

    includedContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            renderSplitInputs(group, null);
        });
    });

    document.getElementById('input-expense-date').value = getToday();
    document.getElementById('input-split-type').value = 'equal';

    // Currency defaults
    const baseCurrency = group.baseCurrency || 'INR';
    const currencySelect = document.getElementById('input-expense-currency');
    currencySelect.value = baseCurrency;
    document.getElementById('exchange-rate-group').style.display = 'none';
    document.getElementById('converted-amount-display').textContent = '';
    document.getElementById('base-currency-label').textContent = baseCurrency;

    // Initialize payers with one row
    const firstMember = members.length > 0 ? members[0] : '';
    renderPayerRows(group, [{ member: firstMember, amount: '' }]);

    renderSplitInputs(group, null);
}

// ---- RENDER SPLIT INPUTS ----

function renderSplitInputs(group, expenseData) {
    const splitType = document.getElementById('input-split-type').value;
    const container = document.getElementById('split-inputs-container');
    const checkboxes = document.querySelectorAll('#expense-included-list input[type="checkbox"]');
    const included = [];
    checkboxes.forEach(cb => {
        if (cb.checked) included.push(cb.value);
    });

    container.innerHTML = '';
    const errorEl = document.getElementById('split-error');
    const infoEl = document.getElementById('split-info');
    const summaryEl = document.getElementById('custom-summary');
    errorEl.classList.add('hidden');
    infoEl.classList.add('hidden');
    summaryEl.classList.add('hidden');

    if (included.length === 0) {
        container.innerHTML = '<div style="font-size:13px;color:#94a3b8;">Select at least one member.</div>';
        return;
    }

    if (splitType === 'equal') {
        container.innerHTML = '<div style="font-size:13px;color:#64748b;">Equal split among selected members.</div>';
        summaryEl.classList.add('hidden');
        return;
    }

    const amountInput = document.getElementById('input-expense-amount');
    const totalAmount = parseFloat(amountInput.value) || 0;
    const currency = document.getElementById('input-expense-currency').value;
    const splits = expenseData?.splits || {};

    const displayCurrency = currency;

    included.forEach(member => {
        const row = document.createElement('div');
        row.className = 'split-input-row';
        row.dataset.member = member;

        const label = document.createElement('span');
        label.className = 'member-label';
        label.textContent = member;

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0';
        input.placeholder = splitType === 'percentage' ? '%' : getCurrencySymbol(displayCurrency);

        if (expenseData && splits[member] !== undefined) {
            input.value = splits[member];
        } else if (splitType === 'percentage') {
            input.value = (100 / included.length).toFixed(2);
        } else if (splitType === 'custom' && totalAmount > 0) {
            input.value = (totalAmount / included.length).toFixed(2);
        } else {
            input.value = '0';
        }

        input.addEventListener('input', () => {
            validateSplitInputs(group);
        });

        const suffix = document.createElement('span');
        suffix.className = 'suffix';
        suffix.textContent = splitType === 'percentage' ? '%' : getCurrencySymbol(displayCurrency);

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(suffix);
        container.appendChild(row);
    });

    if (splitType === 'custom') {
        summaryEl.classList.remove('hidden');
        amountInput.addEventListener('input', () => {
            validateSplitInputs(group);
        });
        document.getElementById('input-expense-currency').addEventListener('change', () => {
            validateSplitInputs(group);
        });
        validateSplitInputs(group);
    } else {
        summaryEl.classList.add('hidden');
    }

    if (splitType === 'percentage') {
        validateSplitInputs(group);
    }
}

function validateSplitInputs(group) {
    const splitType = document.getElementById('input-split-type').value;
    const errorEl = document.getElementById('split-error');
    const infoEl = document.getElementById('split-info');
    const summaryEl = document.getElementById('custom-summary');
    const rows = document.querySelectorAll('.split-input-row');
    const amountInput = document.getElementById('input-expense-amount');
    const totalAmount = parseFloat(amountInput.value) || 0;
    const currency = document.getElementById('input-expense-currency').value;

    if (splitType === 'equal' || rows.length === 0) {
        errorEl.classList.add('hidden');
        infoEl.classList.add('hidden');
        summaryEl.classList.add('hidden');
        return;
    }

    let total = 0;
    let valid = true;
    let errorMsg = '';
    const values = {};
    rows.forEach(row => {
        const member = row.dataset.member;
        const input = row.querySelector('input');
        const val = parseFloat(input.value);
        if (!isNaN(val) && val >= 0) {
            values[member] = val;
            total += val;
        } else {
            valid = false;
            errorMsg = 'Invalid value in one of the fields.';
        }
    });

    if (!valid) {
        errorEl.textContent = errorMsg;
        errorEl.classList.remove('hidden');
        infoEl.classList.add('hidden');
        summaryEl.classList.add('hidden');
        return;
    }

    let infoText = '';
    let isError = false;

    if (splitType === 'percentage') {
        if (Math.abs(total - 100) > 0.001) {
            isError = true;
            errorEl.textContent = `Total percentage must equal 100% (current: ${total.toFixed(2)}%)`;
            errorEl.classList.remove('hidden');
            infoEl.classList.add('hidden');
        } else {
            errorEl.classList.add('hidden');
            const baseCurrency = group?.baseCurrency || 'INR';
            const perPerson = Object.keys(values).map(member => {
                const pct = values[member];
                const amt = (pct / 100) * totalAmount;
                const exchangeRate = parseFloat(document.getElementById('input-exchange-rate').value) || 1;
                const baseAmt = totalAmount * exchangeRate;
                const shareBase = (pct / 100) * baseAmt;
                return { member, pct, baseAmt: shareBase };
            });
            infoText = perPerson.map(p => `${p.member}: ${formatCurrency(p.baseAmt, baseCurrency)} (${p.pct.toFixed(2)}%)`).join(' · ');
            infoEl.textContent = infoText;
            infoEl.className = 'split-info valid';
            infoEl.classList.remove('hidden');
            summaryEl.classList.add('hidden');
        }
    } else if (splitType === 'custom') {
        const expenseAmount = parseFloat(document.getElementById('input-expense-amount').value) || 0;
        const exchangeRate = parseFloat(document.getElementById('input-exchange-rate').value) || 1;
        const allocated = total;
        const remaining = expenseAmount - allocated;

        const summaryHtml = `
            <div class="summary-line">
                <span class="label">Expense Total:</span>
                <span class="value">${formatCurrency(expenseAmount, currency)}</span>
            </div>
            <div class="summary-line">
                <span class="label">Allocated:</span>
                <span class="value">${formatCurrency(allocated, currency)}</span>
            </div>
            <div class="summary-line remaining ${Math.abs(remaining) < 0.001 ? 'valid' : (remaining > 0 ? 'invalid' : 'invalid')}">
                <span class="label">Remaining:</span>
                <span class="value">${formatCurrency(remaining, currency)}</span>
            </div>
        `;
        summaryEl.innerHTML = summaryHtml;
        summaryEl.classList.remove('hidden');

        if (Math.abs(remaining) < 0.001) {
            errorEl.classList.add('hidden');
        } else if (remaining > 0) {
            errorEl.textContent = `Please allocate the remaining ${formatCurrency(remaining, currency)}.`;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.textContent = `Allocated amount exceeds expense by ${formatCurrency(Math.abs(remaining), currency)}.`;
            errorEl.classList.remove('hidden');
        }
        infoEl.classList.add('hidden');
    }
}

// ---- MODAL HELPERS ----

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
    editingExpenseId = null;
    document.getElementById('expense-modal-title').textContent = 'Add Expense';
    document.getElementById('btn-confirm-expense').textContent = 'Add Expense';
}

// ---- TAB SWITCHING ----

function switchTab(tabName) {
    currentTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const activePanel = document.getElementById(`tab-${tabName}`);
    if (activePanel) activePanel.classList.add('active');

    if (tabName === 'overview') {
        const group = groups.find(g => g.id === currentGroupId);
        if (group) renderOverview(group);
    }
}

// ---- EVENT BINDING ----

function init() {
    loadData();

    // --- Status toggle ---
    const openBtn = document.getElementById('status-open');
    const historyBtn = document.getElementById('status-history');
    if (openBtn && historyBtn) {
        openBtn.addEventListener('click', () => {
            openBtn.classList.add('active');
            historyBtn.classList.remove('active');
            currentStatusFilter = 'open';
            renderHome();
        });
        historyBtn.addEventListener('click', () => {
            historyBtn.classList.add('active');
            openBtn.classList.remove('active');
            currentStatusFilter = 'settled';
            renderHome();
        });
    }

    // --- Home: create group ---
    const createGroupBtn = document.getElementById('btn-create-group');
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => {
            openModal('modal-create-group');
            document.getElementById('input-group-name').value = '';
            document.getElementById('group-name-error').classList.add('hidden');
        });
    }

    const confirmGroupBtn = document.getElementById('btn-confirm-group');
    if (confirmGroupBtn) {
        confirmGroupBtn.addEventListener('click', () => {
            const input = document.getElementById('input-group-name');
            const name = input.value.trim();
            const errorEl = document.getElementById('group-name-error');
            if (!name) {
                errorEl.textContent = 'Please enter a group name.';
                errorEl.classList.remove('hidden');
                return;
            }
            if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
                errorEl.textContent = 'A group with this name already exists.';
                errorEl.classList.remove('hidden');
                return;
            }
            errorEl.classList.add('hidden');
            const newGroup = {
                id: generateId(),
                name: name,
                members: [],
                expenses: [],
                status: 'open',
                settledAt: null,
                paymentStatus: {},
                baseCurrency: 'INR'
            };
            groups.push(newGroup);
            saveData();
            closeModal('modal-create-group');
            renderHome();
        });
    }

    // --- Back to home ---
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            showHomeView();
        });
    }

    // --- Rename group ---
    const renameBtn = document.getElementById('btn-rename-group');
    if (renameBtn) {
        renameBtn.addEventListener('click', () => {
            const group = groups.find(g => g.id === currentGroupId);
            if (!group) return;
            const newName = prompt('Enter new group name:', group.name);
            if (newName === null) return;
            const trimmed = newName.trim();
            if (!trimmed) {
                alert('Group name cannot be empty.');
                return;
            }
            if (groups.some(g => g.id !== currentGroupId && g.name.toLowerCase() === trimmed.toLowerCase())) {
                alert('A group with this name already exists.');
                return;
            }
            group.name = trimmed;
            saveData();
            renderGroup(currentGroupId);
        });
    }

    // --- Change base currency ---
    const currencyBtn = document.getElementById('btn-change-currency');
    if (currencyBtn) {
        currencyBtn.addEventListener('click', () => {
            const group = groups.find(g => g.id === currentGroupId);
            if (!group) return;

            if (group.expenses && group.expenses.length > 0) {
                alert('Base currency can\'t be changed after expenses have been added.');
                return;
            }

            const currencyCodes = Object.keys(CURRENCIES);
            const current = group.baseCurrency || 'INR';
            const msg = `Current base currency: ${current} (${CURRENCIES[current].name})\n\nSelect new base currency:\n${currencyCodes.join(', ')}`;
            const newCode = prompt(msg, current);
            if (newCode === null) return;
            const trimmedCode = newCode.trim().toUpperCase();
            if (!CURRENCIES[trimmedCode]) {
                alert('Invalid currency code. Please use one of: ' + currencyCodes.join(', '));
                return;
            }
            group.baseCurrency = trimmedCode;
            saveData();
            renderGroup(currentGroupId);
        });
    }

    // --- Delete group ---
    const deleteGroupBtn = document.getElementById('btn-delete-group');
    if (deleteGroupBtn) {
        deleteGroupBtn.addEventListener('click', () => {
            if (!currentGroupId) return;
            if (confirm('Delete this group and all its data?')) {
                groups = groups.filter(g => g.id !== currentGroupId);
                saveData();
                showHomeView();
            }
        });
    }

    // --- Add member ---
    const addMemberBtn = document.getElementById('btn-add-member');
    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', addMember);
    }
    const memberInput = document.getElementById('input-member-name');
    if (memberInput) {
        memberInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addMember();
        });
    }

    // --- Add expense: open modal ---
    const addExpenseBtn = document.getElementById('btn-add-expense');
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', () => {
            const group = groups.find(g => g.id === currentGroupId);
            if (!group) return;
            if (!group.members || group.members.length === 0) {
                alert('Please add members first.');
                return;
            }
            editingExpenseId = null;
            document.getElementById('expense-modal-title').textContent = 'Add Expense';
            document.getElementById('btn-confirm-expense').textContent = 'Add Expense';
            populateExpenseModal(group);
            document.getElementById('input-expense-desc').value = '';
            document.getElementById('input-expense-amount').value = '';
            document.getElementById('input-expense-notes').value = '';
            document.getElementById('split-error').classList.add('hidden');
            document.getElementById('split-info').classList.add('hidden');
            document.getElementById('input-split-type').value = 'equal';
            document.getElementById('exchange-rate-group').style.display = 'none';
            document.getElementById('converted-amount-display').textContent = '';
            renderSplitInputs(group, null);
            openModal('modal-add-expense');
        });
    }

    // --- Confirm expense ---
    const confirmExpenseBtn = document.getElementById('btn-confirm-expense');
    if (confirmExpenseBtn) {
        confirmExpenseBtn.addEventListener('click', addExpense);
    }

    // --- Split type change ---
    const splitTypeSelect = document.getElementById('input-split-type');
    if (splitTypeSelect) {
        splitTypeSelect.addEventListener('change', () => {
            document.getElementById('split-error').classList.add('hidden');
            document.getElementById('split-info').classList.add('hidden');
            const group = groups.find(g => g.id === currentGroupId);
            if (group) {
                let expenseData = null;
                if (editingExpenseId) {
                    const exp = group.expenses.find(e => e.id === editingExpenseId);
                    if (exp) expenseData = exp;
                }
                renderSplitInputs(group, expenseData);
            }
        });
    }

    // --- Currency change in modal ---
    const currencySelect = document.getElementById('input-expense-currency');
    if (currencySelect) {
        currencySelect.addEventListener('change', () => {
            const group = groups.find(g => g.id === currentGroupId);
            if (!group) return;
            const baseCurrency = group.baseCurrency || 'INR';
            const expCurrency = currencySelect.value;
            if (expCurrency === baseCurrency) {
                document.getElementById('exchange-rate-group').style.display = 'none';
                document.getElementById('converted-amount-display').textContent = '';
            } else {
                document.getElementById('exchange-rate-group').style.display = 'block';
                document.getElementById('base-currency-label').textContent = baseCurrency;
                document.getElementById('exp-currency-label').textContent = expCurrency;
                updateConvertedAmountDisplay(baseCurrency, expCurrency);
            }
            const groupObj = groups.find(g => g.id === currentGroupId);
            validateSplitInputs(groupObj);
            updatePayerSummary(groupObj);
        });
    }

    // --- Exchange rate input ---
    const rateInput = document.getElementById('input-exchange-rate');
    if (rateInput) {
        rateInput.addEventListener('input', () => {
            const group = groups.find(g => g.id === currentGroupId);
            if (!group) return;
            const baseCurrency = group.baseCurrency || 'INR';
            const expCurrency = document.getElementById('input-expense-currency').value;
            if (expCurrency !== baseCurrency) {
                updateConvertedAmountDisplay(baseCurrency, expCurrency);
            }
            const splitType = document.getElementById('input-split-type').value;
            if (splitType === 'custom') {
                validateSplitInputs(group);
            }
            updatePayerSummary(group);
        });
    }

    // --- Amount input changes trigger validation ---
    const amountInput = document.getElementById('input-expense-amount');
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            const group = groups.find(g => g.id === currentGroupId);
            if (!group) return;
            const splitType = document.getElementById('input-split-type').value;
            const expCurrency = document.getElementById('input-expense-currency').value;
            const baseCurrency = group.baseCurrency || 'INR';
            if (expCurrency !== baseCurrency) {
                updateConvertedAmountDisplay(baseCurrency, expCurrency);
            }
            validateSplitInputs(group);
            updatePayerSummary(group);
        });
    }

    // --- Add payer button ---
    document.getElementById('btn-add-payer').addEventListener('click', () => {
        const group = groups.find(g => g.id === currentGroupId);
        if (!group) return;
        // Get existing payers
        const rows = document.querySelectorAll('.payer-row');
        const existingPayers = [];
        rows.forEach(row => {
            const select = row.querySelector('select');
            const input = row.querySelector('input');
            const member = select.value;
            const amt = parseFloat(input.value) || 0;
            if (member) {
                existingPayers.push({ member, amount: amt });
            }
        });
        // Add a new empty payer row
        existingPayers.push({ member: '', amount: '' });
        renderPayerRows(group, existingPayers);
    });

    // --- Modal close buttons ---
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.close;
            if (modalId) closeModal(modalId);
        });
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('open');
                editingExpenseId = null;
                document.getElementById('expense-modal-title').textContent = 'Add Expense';
                document.getElementById('btn-confirm-expense').textContent = 'Add Expense';
            }
        });
    });

    // --- Tab switching ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) switchTab(tab);
        });
    });

    // --- Initial render ---
    renderHome();
}

// ---- START ----
document.addEventListener('DOMContentLoaded', init); 
