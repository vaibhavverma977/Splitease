// ============================
//  SplitEase - app.js (v1)
//  Offline-first expense splitting
//  Full V1 with flexible splits & Overview chart
// ============================

// ---- DATA LAYER ----

const STORAGE_KEY = 'splitEaseData';

let groups = [];
let currentGroupId = null;
let editingExpenseId = null;

// Load data from localStorage
function loadData() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                groups = parsed;
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

function getToday() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
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
    renderGroup(groupId);
}

// ---- RENDER HOME ----

function renderHome() {
    const container = document.getElementById('groups-list');
    const emptyState = document.getElementById('empty-state');
    container.innerHTML = '';

    if (groups.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    groups.forEach(group => {
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
        const expenseCount = group.expenses ? group.expenses.length : 0;
        metaSpan.textContent = `${memberCount} members · ${expenseCount} expenses`;

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
    renderMembers(group);
    renderExpenses(group);
    renderOverview(group);
    renderBalances(group);
    populateExpenseModal(group);
    switchTab('members');
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

    // Check if member is used in any expense
    const isUsed = group.expenses.some(exp => {
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
        const payer = exp.payer || 'Unknown';
        const dateStr = exp.date ? formatDate(exp.date) : '';
        const datePart = dateStr ? ` · ${dateStr}` : '';
        let splitTypeLabel = 'Equal';
        if (exp.splitType === 'percentage') splitTypeLabel = 'Percentage';
        else if (exp.splitType === 'custom') splitTypeLabel = 'Custom';
        details.innerHTML = `
            <span>Paid by ${payer}${datePart}</span>
            <span class="split-type-badge">${splitTypeLabel}</span>
        `;

        info.appendChild(desc);
        info.appendChild(details);

        const amountSpan = document.createElement('span');
        amountSpan.className = 'expense-amount';
        amountSpan.textContent = `₹${Number(exp.amount).toFixed(2)}`;

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
    document.getElementById('input-expense-amount').value = expense.amount || '';
    document.getElementById('input-expense-date').value = expense.date || getToday();
    document.getElementById('input-expense-notes').value = expense.notes || '';

    // Payer
    const payerSelect = document.getElementById('input-expense-payer');
    payerSelect.value = expense.payer || '';

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

function addExpense() {
    const descInput = document.getElementById('input-expense-desc');
    const amountInput = document.getElementById('input-expense-amount');
    const dateInput = document.getElementById('input-expense-date');
    const payerSelect = document.getElementById('input-expense-payer');
    const splitTypeSelect = document.getElementById('input-split-type');
    const notesInput = document.getElementById('input-expense-notes');
    const checkboxes = document.querySelectorAll('#expense-included-list input[type="checkbox"]');
    const errorEl = document.getElementById('split-error');

    const description = descInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const date = dateInput.value || getToday();
    const payer = payerSelect.value;
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
    if (!payer) {
        errorEl.textContent = 'Please select who paid.';
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

    // Build expense object
    let expenseData = {
        description,
        amount,
        date,
        payer,
        splitType,
        notes
    };

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
            if (Math.abs(total - amount) > 0.001) {
                errorEl.textContent = `Total custom amounts (₹${total.toFixed(2)}) must equal ₹${amount.toFixed(2)}.`;
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
        // Update existing expense
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

    // Compute spending by member
    const spending = calculateSpendingByMember(group);
    const total = Object.values(spending).reduce((sum, val) => sum + val, 0);

    totalSpan.textContent = `₹${total.toFixed(2)}`;

    if (total === 0 || !group.members || group.members.length === 0) {
        empty.style.display = 'block';
        container.innerHTML = '';
        legendContainer.innerHTML = '';
        breakdownContainer.innerHTML = '';
        return;
    }
    empty.style.display = 'none';

    // Build pie chart (SVG)
    const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const membersWithSpending = group.members.filter(m => spending[m] && spending[m] > 0);
    const totalSpending = total;

    // Prepare data for slices
    const slices = membersWithSpending.map((member, index) => {
        const value = spending[member];
        const percentage = (value / totalSpending) * 100;
        const color = colors[index % colors.length];
        return { member, value, percentage, color };
    });

    // Generate SVG pie chart
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.style.width = '100%';
    svg.style.height = '100%';

    let startAngle = -90; // start at top (12 o'clock)

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

    // Add a small white circle in the center for donut effect (optional)
    const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerCircle.setAttribute('cx', '50');
    centerCircle.setAttribute('cy', '50');
    centerCircle.setAttribute('r', '20');
    centerCircle.setAttribute('fill', '#ffffff');
    svg.appendChild(centerCircle);

    container.innerHTML = '';
    container.appendChild(svg);

    // Legend
    legendContainer.innerHTML = '';
    slices.forEach(slice => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const colorBox = document.createElement('span');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = slice.color;
        const label = document.createElement('span');
        label.textContent = `${slice.member} (₹${slice.value.toFixed(2)})`;
        item.appendChild(colorBox);
        item.appendChild(label);
        legendContainer.appendChild(item);
    });

    // Breakdown list
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
        amountSpan.textContent = `₹${amount.toFixed(2)}`;
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
            netSpan.textContent = `+₹${netValue.toFixed(2)}`;
        } else if (netValue < -0.005) {
            netSpan.classList.add('negative');
            netSpan.textContent = `-₹${Math.abs(netValue).toFixed(2)}`;
        } else {
            netSpan.classList.add('zero');
            netSpan.textContent = '₹0.00';
        }

        row.appendChild(nameSpan);
        row.appendChild(netSpan);

        const details = document.createElement('div');
        details.className = 'balance-details';
        details.innerHTML = `
            <span>Paid: ₹${data.paid.toFixed(2)}</span>
            <span>Share: ₹${data.share.toFixed(2)}</span>
        `;

        item.appendChild(row);
        item.appendChild(details);
        container.appendChild(item);
    });

    // Settlement
    const settlement = calculateSettlement(group);
    if (settlement.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'settlement-item';
        msg.textContent = 'All settled! 🎉';
        settlementContainer.appendChild(msg);
    } else {
        settlement.forEach(s => {
            const item = document.createElement('div');
            item.className = 'settlement-item';
            const fromTo = document.createElement('span');
            fromTo.className = 'from-to';
            fromTo.textContent = `${s.from} pays ${s.to}`;
            const amountSpan = document.createElement('span');
            amountSpan.className = 'amount';
            amountSpan.textContent = `₹${s.amount.toFixed(2)}`;
            item.appendChild(fromTo);
            item.appendChild(amountSpan);
            settlementContainer.appendChild(item);
        });
    }
}

// ---- CALCULATION FUNCTIONS ----

function calculateExpenseShares(expense) {
    // Returns an object { member: share }
    const amount = expense.amount;
    const splitType = expense.splitType || 'equal';
    let shares = {};

    if (splitType === 'equal') {
        const included = expense.included || [];
        if (included.length === 0) return {};
        const perPerson = amount / included.length;
        included.forEach(person => {
            shares[person] = perPerson;
        });
    } else if (splitType === 'percentage' || splitType === 'custom') {
        shares = expense.splits || {};
        // Ensure amounts are numbers
        Object.keys(shares).forEach(key => {
            shares[key] = Number(shares[key]);
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
        const amount = exp.amount;
        const payer = exp.payer;
        const shares = calculateExpenseShares(exp);

        // Add full amount to payer
        if (balances[payer]) {
            balances[payer].paid += amount;
        }

        // Add shares
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
        const payer = exp.payer;
        if (spending[payer] !== undefined) {
            spending[payer] += exp.amount;
        }
    });

    return spending;
}

// ---- POPULATE EXPENSE MODAL (for new expense) ----

function populateExpenseModal(group) {
    const payerSelect = document.getElementById('input-expense-payer');
    const includedContainer = document.getElementById('expense-included-list');

    payerSelect.innerHTML = '';
    includedContainer.innerHTML = '';

    const members = group.members || [];
    if (members.length === 0) {
        payerSelect.innerHTML = '<option value="">No members</option>';
        includedContainer.innerHTML = '<span style="font-size:13px;color:#94a3b8;">Add members first</span>';
        return;
    }

    members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        payerSelect.appendChild(opt);
    });
    payerSelect.value = members[0] || '';

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
    errorEl.classList.add('hidden');
    infoEl.classList.add('hidden');

    if (included.length === 0) {
        container.innerHTML = '<div style="font-size:13px;color:#94a3b8;">Select at least one member.</div>';
        return;
    }

    if (splitType === 'equal') {
        container.innerHTML = '<div style="font-size:13px;color:#64748b;">Equal split among selected members.</div>';
        return;
    }

    const amountInput = document.getElementById('input-expense-amount');
    const totalAmount = parseFloat(amountInput.value) || 0;
    const splits = expenseData?.splits || {};

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
        input.placeholder = splitType === 'percentage' ? '%' : '₹';

        // Pre-fill
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
            validateSplitInputs();
        });

        const suffix = document.createElement('span');
        suffix.className = 'suffix';
        suffix.textContent = splitType === 'percentage' ? '%' : '₹';

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(suffix);
        container.appendChild(row);
    });

    validateSplitInputs();

    // Re-validate on amount change for custom/percentage
    amountInput.addEventListener('input', validateSplitInputs);
}

function validateSplitInputs() {
    const splitType = document.getElementById('input-split-type').value;
    const errorEl = document.getElementById('split-error');
    const infoEl = document.getElementById('split-info');
    const rows = document.querySelectorAll('.split-input-row');
    const amountInput = document.getElementById('input-expense-amount');
    const totalAmount = parseFloat(amountInput.value) || 0;

    if (splitType === 'equal' || rows.length === 0) {
        errorEl.classList.add('hidden');
        infoEl.classList.add('hidden');
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
        return;
    }

    let infoText = '';
    let isError = false;

    if (splitType === 'percentage') {
        if (Math.abs(total - 100) > 0.001) {
            isError = true;
            errorEl.textContent = `Total percentage must equal 100% (current: ${total.toFixed(2)}%)`;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.classList.add('hidden');
            const perPerson = Object.keys(values).map(member => {
                const pct = values[member];
                const amt = (pct / 100) * totalAmount;
                return { member, pct, amt };
            });
            infoText = perPerson.map(p => `${p.member}: ₹${p.amt.toFixed(2)} (${p.pct.toFixed(2)}%)`).join(' · ');
            infoEl.textContent = infoText;
            infoEl.className = 'split-info valid';
            infoEl.classList.remove('hidden');
        }
    } else if (splitType === 'custom') {
        if (Math.abs(total - totalAmount) > 0.001) {
            isError = true;
            errorEl.textContent = `Total custom amounts (₹${total.toFixed(2)}) must equal expense amount (₹${totalAmount.toFixed(2)}).`;
            errorEl.classList.remove('hidden');
            infoEl.classList.add('hidden');
        } else {
            errorEl.classList.add('hidden');
            infoText = `Total: ₹${total.toFixed(2)} ✓`;
            infoEl.textContent = infoText;
            infoEl.className = 'split-info valid';
            infoEl.classList.remove('hidden');
        }
    }

    if (isError) {
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

    // If overview tab, re-render to update chart
    if (tabName === 'overview') {
        const group = groups.find(g => g.id === currentGroupId);
        if (group) renderOverview(group);
    }
}

// ---- EVENT BINDING ----

function init() {
    loadData();

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
                expenses: []
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
            renderSplitInputs(group, null);
            openModal('modal-add-expense');
        });
    }

    // --- Confirm expense (add or update) ---
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

    // --- Amount input changes trigger validation ---
    const amountInput = document.getElementById('input-expense-amount');
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            const splitType = document.getElementById('input-split-type').value;
            if (splitType === 'custom' || splitType === 'percentage') {
                validateSplitInputs();
            }
        });
    }

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
