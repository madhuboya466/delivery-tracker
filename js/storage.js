/* ==========================================================================
   storage.js — Supabase database data layer
   ========================================================================== */

const Storage = {
  /** Return all entries, sorted newest date first. */
  async getAll() {
    try {
      const { data, error } = await dbClient
        .from('entries')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      return (data || []).map((e) => ({
        id: e.id,
        date: e.date,
        swiggy: e.swiggy,
        zomato: e.zomato,
        other: e.other,
        petrol: e.petrol,
        food: e.food,
        tea: e.tea,
        recharge: e.recharge,
        bike: e.bike,
        misc: e.misc,
        sentHome: e.sent_home,
        notes: e.notes || ''
      }));
    } catch (e) {
      console.error('Storage.getAll failed', e);
      return [];
    }
  },

  /** Find one entry by date (YYYY-MM-DD). */
  async getByDate(date) {
    try {
      const { data, error } = await dbClient
        .from('entries')
        .select('*')
        .eq('date', date)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        date: data.date,
        swiggy: data.swiggy,
        zomato: data.zomato,
        other: data.other,
        petrol: data.petrol,
        food: data.food,
        tea: data.tea,
        recharge: data.recharge,
        bike: data.bike,
        misc: data.misc,
        sentHome: data.sent_home,
        notes: data.notes || ''
      };
    } catch (e) {
      console.error('Storage.getByDate failed', e);
      return null;
    }
  },

  /** Find one entry by id. */
  async getById(id) {
    try {
      const { data, error } = await dbClient
        .from('entries')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        date: data.date,
        swiggy: data.swiggy,
        zomato: data.zomato,
        other: data.other,
        petrol: data.petrol,
        food: data.food,
        tea: data.tea,
        recharge: data.recharge,
        bike: data.bike,
        misc: data.misc,
        sentHome: data.sent_home,
        notes: data.notes || ''
      };
    } catch (e) {
      console.error('Storage.getById failed', e);
      return null;
    }
  },

  /** Insert a new entry, or overwrite the existing one for that date. */
  async upsert(entry) {
    const payload = {
      id: entry.id || 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      date: entry.date,
      swiggy: num(entry.swiggy),
      zomato: num(entry.zomato),
      other: num(entry.other),
      petrol: num(entry.petrol),
      food: num(entry.food),
      tea: num(entry.tea),
      recharge: num(entry.recharge),
      bike: num(entry.bike),
      misc: num(entry.misc),
      sent_home: num(entry.sentHome),
      notes: entry.notes || ''
    };

    const { data, error } = await dbClient
      .from('entries')
      .upsert(payload, { onConflict: 'date' })
      .select();

    if (error) {
      console.error('Storage.upsert failed', error);
      throw error;
    }
    return data[0];
  },

  /** Remove an entry by id. */
  async remove(id) {
    const { error } = await dbClient
      .from('entries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Storage.remove failed', error);
      throw error;
    }
  },

  /** Wipe every entry. */
  async clearAll() {
    const { error } = await dbClient
      .from('entries')
      .delete()
      .neq('id', '0');

    if (error) {
      console.error('Storage.clearAll failed', error);
      throw error;
    }
  },

  getTheme() {
    return localStorage.getItem('dpt_theme_v1') || 'light';
  },
  setTheme(theme) {
    localStorage.setItem('dpt_theme_v1', theme);
  },

  getLastMonth() {
    return localStorage.getItem('dpt_last_month_v1') || '';
  },
  setLastMonth(ym) {
    localStorage.setItem('dpt_last_month_v1', ym);
  },

  // async getGoal() {
  //   try {
  //     const { data, error } = await dbClient
  //       .from('user_settings')
  //       .select('value')
  //       .eq('key', 'goal')
  //       .maybeSingle();

  //     if (error || !data) return 30000;
  //     return Number(data.value) || 30000;
  //   } catch (e) {
  //     return 30000;
  //   }
  // },

  // async setGoal(val) {
  //   const { error } = await dbClient
  //     .from('user_settings')
  //     .upsert({ key: 'goal', value: String(val) });

  //   if (error) console.error('Storage.setGoal failed', error);
  // },

  async getGoal() {
    try {
      const { data, error } = await dbClient
        .from('user_settings')
        .select('value')
        .eq('key', 'goal')
        .maybeSingle();

      if (error || !data) return 21000;
      return Number(data.value) || 21000;
    } catch (e) {
      return 21000;
    }
  },

  async setGoal(val) {
    const { error } = await dbClient
      .from('user_settings')
      .upsert({ key: 'goal', value: String(val) });

    if (error) console.error('Storage.setGoal failed', error);
  },
  
  async exportBackup() {
    const entries = await this.getAll();
    const goal = await this.getGoal();
    return JSON.stringify({ entries, goal, exportedAt: new Date().toISOString() }, null, 2);
  },

  async restoreBackup(payload) {
    if (!payload || !Array.isArray(payload.entries)) {
      throw new Error('Invalid backup file');
    }
    for (const entry of payload.entries) {
      await this.upsert(entry);
    }
    if (payload.goal) await this.setGoal(payload.goal);
    return payload.entries.length;
  }
};

/* ---------- Shared calculation helpers ---------- */

const Calc = {
  totalEarnings(e) {
    return num(e.swiggy) + num(e.zomato) + num(e.other);
  },
  totalExpenses(e) {
    return num(e.petrol) + num(e.food) + num(e.tea) + num(e.recharge) + num(e.bike) + num(e.misc);
  },
  balanceBeforeHome(e) {
    return Calc.totalEarnings(e) - Calc.totalExpenses(e);
  },
  finalSavings(e) {
    return Calc.balanceBeforeHome(e) - num(e.sentHome);
  },
};

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function formatCurrency(n) {
  const val = Math.round((n + Number.EPSILON) * 100) / 100;
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1); // Subtract 1 day
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}