const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CASH_IN_API = 'https://developers.paysera.com/tasks/api/cash-in';
const CASH_OUT_NATURAL_API = 'https://developers.paysera.com/tasks/api/cash-out-natural';
const CASH_OUT_JURIDICAL_API = 'https://developers.paysera.com/tasks/api/cash-out-juridical';

const getCommissionConfig = async () => {
    const [cashInConfig, cashOutNaturalConfig, cashOutJuridicalConfig] = await Promise.all([
        axios.get(CASH_IN_API).then(res => res.data),
        axios.get(CASH_OUT_NATURAL_API).then(res => res.data),
        axios.get(CASH_OUT_JURIDICAL_API).then(res => res.data)
    ]);

    return {
        cashIn: cashInConfig,
        cashOutNatural: cashOutNaturalConfig,
        cashOutJuridical: cashOutJuridicalConfig
    };
};

const roundUp = (num) => Math.ceil(num * 100) / 100;

const calculateCashInFee = (amount, config) => {
    const fee = (amount * config.percents) / 100;
    return roundUp(Math.min(fee, config.max.amount));
};

const calculateCashOutFeeNatural = (amount, weekAmount, config) => {
    const excessAmount = Math.max(0, amount - Math.max(0, config.week_limit.amount - weekAmount));
    return roundUp((excessAmount * config.percents) / 100);
};

const calculateCashOutFeeJuridical = (amount, config) => {
    const fee = (amount * config.percents) / 100;
    return roundUp(Math.max(fee, config.min.amount));
};

const processTransactions = async (inputFile) => {
    const rawData = fs.readFileSync(path.resolve(__dirname, inputFile));
    const transactions = JSON.parse(rawData);

    const config = await getCommissionConfig();
    const weeklyAmounts = {};

    const results = transactions.map(transaction => {
        const { date, user_id, user_type, type, operation } = transaction;
        const { amount, currency } = operation;

        if (currency !== 'EUR') {
            throw new Error('Unsupported currency');
        }

        const week = getWeekNumber(new Date(date));
        weeklyAmounts[user_id] = weeklyAmounts[user_id] || {};
        weeklyAmounts[user_id][week] = weeklyAmounts[user_id][week] || 0;

        let fee;
        if (type === 'cash_in') {
            fee = calculateCashInFee(amount, config.cashIn);
        } else if (type === 'cash_out') {
            if (user_type === 'natural') {
                fee = calculateCashOutFeeNatural(amount, weeklyAmounts[user_id][week], config.cashOutNatural);
                weeklyAmounts[user_id][week] += amount;
            } else if (user_type === 'juridical') {
                fee = calculateCashOutFeeJuridical(amount, config.cashOutJuridical);
            }
        }

        return fee.toFixed(2);
    });

    results.forEach(result => console.log(result));
};

const getWeekNumber = (date) => {
    const startDate = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startDate) / (24 * 60 * 60 * 1000));
    return Math.ceil((date.getDay() + 1 + days) / 7);
};

const inputFile = process.argv[2];
processTransactions(inputFile);
