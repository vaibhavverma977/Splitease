// ============================
//  SplitEase - app.js (v1)
//  Offline-first expense splitting
// ============================

// ---- DATA LAYER ----

const STORAGE_KEY = 'splitEaseData';

let groups = [];
let currentGroupId = null; // null when on home view

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
    // If no data or corrupted, start with empty array
    groups = [];
}

// Save data to localStorage
function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

// Helper: generate short unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

// ---- RENDER GROUP (all tabs) ----

function renderGroup(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) {
        showHomeView();
        return;
    }

    // Update header title
    document.getElementById('group-title').textContent = group.name;

    // Render members tab
    renderMembers(group);

    // Render expenses tab
    renderExpenses(group);

    // Render balances tab
    renderBalances(group);

    // Refresh the included members in expense modal (populate checkboxes and payer dropdown)
    populateExpenseModal(group);

    // Show the first tab (members) by default
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

    // Check duplicate (case-insensitive)
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

    // Remove member from the group's members list ONLY.
    // Historical expenses are never modified – payer and included lists remain unchanged.
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

    // Sort expenses by creation time (id is timestamp-based)
    const sorted = [...group.expenses].sort((a, b) => (a.id < b.id ? -1 : 1));

    sorted.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'expense-item';

        const info = document.createElement('div');
        info.className = 'expense-info';
        const desc = document.createElement('span');
        desc.className = 'expense-desc';
        desc.textContent = exp.description;
        const details = document.createElement('span');
        details.className = 'expense-details';
        const includedStr = exp.included && exp.included.length > 0 ? exp.included.join(', ') : 'No one';
        details.textContent = `Paid by ${exp.payer} · ₹${Number(exp.amount).toFixed(2)} · Split ${exp.included.length} ways`;

        info.appendChild(desc);
        info.appendChild(details);

        const actions = document.createElement('div');
        actions.className = 'expense-actions';
        const amountSpan = document.createElement('span');
        amountSpan.className = 'expense-amount';
        amountSpan.textContent = `₹${Number(exp.amount).toFixed(2)}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-expense-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.setAttribute('aria-label', 'Delete expense');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this expense?')) {
                deleteExpense(group.id, exp.id);
            }
        });

        actions.appendChild(amountSpan);
        actions.appendChild(deleteBtn);

        item.appendChild(info);
        item.appendChild(actions);
        container.appendChild(item);
    });
}

function addExpense() {
    const descInput = document.getElementById('input-expense-desc');
    const amountInput = document.getElementById('input-expense-amount');
    const payerSelect = document.getElementById('input-expense-payer');
    const checkboxes = document.querySelectorAll('#expense-included-list input[type="checkbox"]');
    const errorEl = document.getElementById('expense-error');

    const description = descInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const payer = payerSelect.value;
    const included = [];
    checkboxes.forEach(cb => {
        if (cb.checked) included.push(cb.value);
    });

    // Validations
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

    errorEl.classList.add('hidden');

    const group = groups.find(g => g.id === currentGroupId);
    if (!group) return;

    if (!group.expenses) group.expenses = [];

    const newExpense = {
        id: generateId(),
        description: description,
        amount: amount,
        payer: payer,
        included: included
    };

    group.expenses.push(newExpense);
    saveData();

    // Reset modal fields
    descInput.value = '';
    amountInput.value = '';
    // Reset checkboxes: uncheck all
    checkboxes.forEach(cb => cb.checked = false);
    // Reset payer to first member or empty
    if (group.members && group.members.length > 0) {
        payerSelect.value = group.members[0];
    } else {
        payerSelect.value = '';
    }

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

    // Calculate balances
    const balances = calculateBalances(group);

    // Display each member's net balance
    const memberList = group.members;
    memberList.forEach(member => {
        const data = balances[member];
        if (!data) return;
        const item = document.createElement('div');
        item.className = 'balance-item';
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

        item.appendChild(nameSpan);
        item.appendChild(netSpan);
        container.appendChild(item);
    });

    // Calculate settlement
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

// ---- BALANCE CALCULATION ----

function calculateBalances(group) {
    // Initialize all members with zero
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
        const included = exp.included || [];

        // Only if included has at least one person
        if (included.length === 0) return;

        const sharePerPerson = amount / included.length;

        // Payer: add full amount to paid
        if (balances[payer]) {
            balances[payer].paid += amount;
        }

        // Each included person owes share (including payer, but net will be paid - share)
        included.forEach(person => {
            if (balances[person]) {
                balances[person].share += sharePerPerson;
            }
        });
    });

    // Compute net: paid - share
    Object.keys(balances).forEach(m => {
        balances[m].net = balances[m].paid - balances[m].share;
    });

    return balances;
}

// ---- SETTLEMENT CALCULATION ----

function calculateSettlement(group) {
    const balances = calculateBalances(group);
    const members = group.members || [];
    // Separate creditors (net > 0) and debtors (net < 0)
    const creditors = [];
    const debtors = [];
    members.forEach(m => {
        const net = balances[m]?.net || 0;
        if (net > 0.005) {
            creditors.push({ name: m, amount: net });
        } else if (net < -0.005) {
            debtors.push({ name: m, amount: -net }); // positive amount owed
        }
    });

    // Sort by amount descending (optional)
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

// ---- POPULATE EXPENSE MODAL ----

function populateExpenseModal(group) {
    const payerSelect = document.getElementById('input-expense-payer');
    const includedContainer = document.getElementById('expense-included-list');

    // Clear previous options
    payerSelect.innerHTML = '';
    includedContainer.innerHTML = '';

    const members = group.members || [];
    if (members.length === 0) {
        payerSelect.innerHTML = '<option value="">No members</option>';
        includedContainer.innerHTML = '<span style="font-size:13px;color:#94a3b8;">Add members first</span>';
        return;
    }

    // Payer dropdown
    members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        payerSelect.appendChild(opt);
    });
    payerSelect.value = members[0] || '';

    // Included checkboxes
    members.forEach(m => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = m;
        cb.checked = true; // by default all selected
        label.appendChild(cb);
        label.appendChild(document.createTextNode(m));
        includedContainer.appendChild(label);
    });
}

// ---- MODAL HELPERS ----

function openModal(modalId) {
    document.getElementById(modalId).classList.add('open');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('open');
}

// ---- TAB SWITCHING ----

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ---- EVENT BINDING ----

function init() {
    loadData();

    // --- Home: create group ---
    document.getElementById('btn-create-group').addEventListener('click', () => {
        openModal('modal-create-group');
        document.getElementById('input-group-name').value = '';
        document.getElementById('group-name-error').classList.add('hidden');
    });

    document.getElementById('btn-confirm-group').addEventListener('click', () => {
        const input = document.getElementById('input-group-name');
        const name = input.value.trim();
        const errorEl = document.getElementById('group-name-error');
        if (!name) {
            errorEl.textContent = 'Please enter a group name.';
            errorEl.classList.remove('hidden');
            return;
        }
        errorEl.classList.add('hidden');
        // Create group
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
        // Optionally open group automatically? We'll just stay on home.
    });

    // --- Back to home ---
    document.getElementById('btn-back').addEventListener('click', () => {
        showHomeView();
    });

    // --- Delete group ---
    document.getElementById('btn-delete-group').addEventListener('click', () => {
        if (!currentGroupId) return;
        if (confirm('Delete this group and all its data?')) {
            groups = groups.filter(g => g.id !== currentGroupId);
            saveData();
            showHomeView();
        }
    });

    // --- Add member ---
    document.getElementById('btn-add-member').addEventListener('click', addMember);
    document.getElementById('input-member-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addMember();
    });

    // --- Add expense: open modal ---
    document.getElementById('btn-add-expense').addEventListener('click', () => {
        const group = groups.find(g => g.id === currentGroupId);
        if (!group) return;
        if (!group.members || group.members.length === 0) {
            alert('Please add members first.');
            return;
        }
        // Populate modal with current members
        populateExpenseModal(group);
        // Clear previous values
        document.getElementById('input-expense-desc').value = '';
        document.getElementById('input-expense-amount').value = '';
        document.getElementById('expense-error').classList.add('hidden');
        openModal('modal-add-expense');
    });

    document.getElementById('btn-confirm-expense').addEventListener('click', addExpense);

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

    // If there is a currentGroupId from previous session? We'll just start at home.
    // But we can try to open last group? Not needed.
}

// ---- START ----
document.addEventListener('DOMContentLoaded', init);
