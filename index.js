const express = require('express');
const session = require('express-session');
const MongoDBSession = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');
const app = express();
const mongoURI = 'mongodb://localhost:27017/financeManager';
const UserModel = require('./models/User');
const BudgetModel = require('./models/Budget');
const CategoryModel = require('./models/Category');
const ExpenseModel = require('./models/Expense');
const SavingsModel = require('./models/Savings');
const SettingsModel = require('./models/Settings');
const TwoFAModel = require('./models/TwoFA');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const { name } = require('ejs');
const { emit } = require('process');
const server = http.createServer(app);
const io = new Server(server);

var userID = null;

mongoose.connect(mongoURI).then((res) => {
    console.log('MongoDB Connected');
});

const store = new MongoDBSession({
    uri: mongoURI,
    collection: 'appSessions'
});

app.use(cookieParser());

app.set("view engine", "ejs");
app.use(express.urlencoded({extended: true}));

app.use(express.json());
app.use(express.static(__dirname + '/public'));

app.use(
    session({
        secret: 'secret-key',
        resave: false,
        saveUninitialized: false,
        store: store
    })
);

const isAuth = (req, res, next) => {
    if(req.session.isAuth){
        next();
    } else {
        res.redirect('/');
    }
}

const isNotAuth = (req, res, next) => {
    if(!req.session.isAuth){
        next();
    } else {
        res.redirect('/dashboard');
    }
}

app.get('/', isNotAuth, (req, res) => {
    res.render('login');
});

app.get('/login', isNotAuth, (req, res) => {
    res.render('login');
});

app.post('/auth/user', isAuth, (req, res) => {
    return res.redirect('/dashboard');
});

app.post('/auth/verify2FA', async (req, res) => {
    const {code, userId} = req.body;

    const twoFA = await TwoFAModel.findOne({userId});
    if(!twoFA.codes.includes(code)){
        return res.status(201).json({
            success: false,
            message: 'Your 2FA code does not have a match'
        });
    }

    req.session.isAuth = true;
    req.session.userID = userId;
    userID = userId;
    res.cookie('userID', userID, { 
        maxAge: 604800000, // Cookie expires in 15 minutes (900,000 milliseconds)
        httpOnly: false // Makes the cookie inaccessible to client-side JavaScript for security
    });

    return res.status(201).json({
        success: true
    });
});

app.post('/api/login', async (req, res) => {
    const {email, password} = req.body;

    let user = await UserModel.findOne({email});

    if(!user){
        return res.status(201).json({
            success: false,
            message: 'Invalid Email'
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if(!isMatch) {
        return res.status(201).json({
            success: false,
            message: 'Incorrect Password'
        });
    }

    let setting = await SettingsModel.findOne({userId: user.id});
    const allow2FA = setting ? setting.allow2FA : false;

    if(!allow2FA){
        req.session.isAuth = true;
        req.session.userID = user.id;
        userID = user.id;
        res.cookie('userID', userID, { 
            maxAge: 604800000, // Cookie expires in 15 minutes (900,000 milliseconds)
            httpOnly: false // Makes the cookie inaccessible to client-side JavaScript for security
        });
    }

    return res.status(201).json({
        success: true,
        userId: user.id,
        allow2FA: allow2FA,
        message: 'Login Successful'
    });
});

app.get('/signup', isNotAuth, (req, res) => {
    res.render('signup');
});

app.post('/api/signup', async (req, res) => {
    const {name, email, password} = req.body;

    let user = await UserModel.findOne({email});

    if(user){
        return res.status(201).json({
            success: false,
            message: 'Email already exists'
        });
    }

    const hashedPswd = await bcrypt.hash(password, 12);

    user = new UserModel({
        name,
        email,
        password: hashedPswd
    });

    const data = await user.save();
    req.session.isAuth = true;
    req.session.userID = data.id;
    userID = data.id;
    res.cookie('userID', userID, { 
        maxAge: 604800000, // Cookie expires in 15 minutes (900,000 milliseconds)
        httpOnly: false // Makes the cookie inaccessible to client-side JavaScript for security
    });
    return res.status(201).json({
        success: true,
        message: 'Account successfully created'
    });
});

app.get('/dashboard', isAuth, async (req, res) => {
    userID = req.cookies.userID;
    const budget = await BudgetModel.find({userId: userID}).sort({'month': 'desc'}).exec();
    const expense = await ExpenseModel.find({userId: userID}).sort({'month': 'desc', 'date': 'desc'}).exec();
    const settings = await SettingsModel.findOne({userId: userID});
    const user = await UserModel.findById(userID);

    const data = {
        settingsData: settings,
        budgetData: budget,
        expenseData: expense,
        userData: user
    };

    if(!settings){
        data.settingsData = {
            userId: userID,
            allowBudgetAlert: true,
            allowGoalAlert: true,
            allow2FA: false,
        };
    }
    
    res.render('dashboard', data);
});

app.get('/budgets', isAuth, async (req, res) => {
    userID = req.cookies.userID;
    const user = await UserModel.findById(userID);
    const budget = await BudgetModel.find({userId: userID}).sort({'date': 'desc'}).exec();
    const category = await CategoryModel.findOne({userId: userID}).exec();    
    const data = {
        budgetData: budget,
        userData: user,
        categoryData: category
    }
    res.render('budgets', data);
});

app.get('/expenses', isAuth, async (req, res) => {
    userID = req.cookies.userID;
    const user = await UserModel.findById(userID);
    const budget = await BudgetModel.find({userId: userID}).sort({'month': 'desc'}).exec();
    const expense = await ExpenseModel.find({userId: userID}).sort({'month': 'desc', 'date': 'desc'}).exec();
    const budgetObject = budgetAsObject(budget);
    const expenseData = groupExpense(expense);
    const data = {
        budgetData: budget,
        expenseData: expenseData,
        userData: user,
        budgetObject: budgetObject
    }
    res.render('expenses', data);
});

app.get('/reports-analytics', isAuth, async (req, res) => {
    userID = req.cookies.userID;
    const user = await UserModel.findById(userID);
    const budget = await BudgetModel.find({userId: userID}).sort({'month': 'desc'}).exec();
    const expense = await ExpenseModel.find({userId: userID}).sort({'month': 'desc', 'date': 'desc'}).exec();
    const data = {
        budgetData: budget,
        userData: user,
        expenseData: expense
    }
    res.render('reports-analytics', data);
});

app.get('/finance-goal', isAuth, async (req, res) => {
    userID = req.cookies.userID;
    const user = await UserModel.findById(userID);
    const budget = await BudgetModel.find({userId: userID}).sort({'month': 'desc'}).exec();
    const scheme = await SavingsModel.find({userId: userID}).sort({'date': 'desc'}).exec();
    const budgetObject = budgetAsObject(budget);
    const data = {
        budgetData: budgetObject,
        userData: user,
        schemeData: scheme
    }
    res.render('finance-goal', data);
});

app.get('/settings', isAuth, async (req, res) => {
    userID = req.cookies.userID;

    let user = await UserModel.findById(userID);
    let settings = await SettingsModel.findOne({userId: userID});
    const category = await CategoryModel.findOne({userId: userID}).exec();    

    const data = {
        settingsData: settings,
        userData: user,
        categoryData: category
    };

    if(!settings){
        data.settingsData = {
            userId: userID,
            allowBudgetAlert: true,
            allowGoalAlert: true,
            allow2FA: false,
        };
    }

    if(data.settingsData.allow2FA){
        let twoFA = await TwoFAModel.findOne({userId: userID});
        data.codes = twoFA.codes;
    }

    data.tab = 'general';
    res.render('settings', data);
});

app.get('/settings/:tab', isAuth, async (req, res) => {
    userID = req.cookies.userID;
    const tabArray = ['general', 'security', 'notifications', 'manage-categories'];
    let tab = req.params.tab.toLowerCase();
    if(!tabArray.includes(tab)){
        res.redirect('/settings');
        return;
    }

    let user = await UserModel.findById(userID);
    let settings = await SettingsModel.findOne({userId: userID});
    const category = await CategoryModel.findOne({userId: userID}).exec();    

    const data = {
        settingsData: settings,
        userData: user,
        categoryData: category
    };

    if(!settings){
        data.settingsData = {
            userId: userID,
            allowBudgetAlert: true,
            allowGoalAlert: true,
            allow2FA: false,
        };
    }

    if(data.settingsData.allow2FA){
        let twoFA = await TwoFAModel.findOne({userId: userID});
        data.codes = twoFA.codes;
    }

    data.tab = tab;
    res.render('settings', data);
});

app.get('/logout', isAuth, (req, res) => {
    req.session.destroy((err) => {
        if(err) throw err;
        res.redirect('/');
    });
});

app.listen(3000, console.log('Server running on http://localhost:3000'));

io.on('connection', (socket) => {
    userID = getCookie('userID', socket.handshake.headers.cookie);
    console.log('A user connected');

    socket.join(userID);

    socket.on('create-budget', async (data) => {

        const emitData = new Object();
        const month = data.month;
        const amount = data.budget;
        const categories = data.categories;
        const income = data.income;
        const date = new Date().toISOString().slice(0,19).replace('T', ' ');
        const query = {
            $and: [
                {userId: userID},
                {month: month}
            ]
        }

        let budget = await BudgetModel.find(query);

        if(budget.length > 0) {
            emitData.success = false;
            emitData.message = 'You already have an existing budget for selected month';
            socket.emit('create-budget', emitData);
            return;
        }
        
        budget = new BudgetModel({
            userId: userID,
            month,
            amount,
            categories,
            income,
            date
        });
    
        const budgetData = await budget.save();
        const budgetID = budgetData.id;
        emitData.success = true;
        emitData.budgetId = budgetID;
        emitData.userId = userID;
        emitData.month = month;
        emitData.amount = amount;
        emitData.income = income;
        emitData.categories = categories;
        emitData.date = date;
        io.to(userID).emit('create-budget', emitData);
    });

    socket.on('create-scheme', async (data) => {

        const startDate = data.startMonth;
        const endDate = data.endMonth;
        const minAmount = data.amount;
        const date = new Date().toISOString().slice(0,19).replace('T', ' ');
        
        const scheme = new SavingsModel({
            userId: userID,
            startDate,
            endDate,
            minAmount,
            date
        });
    
        const schemeData = await scheme.save();
        const emitData = await fetchSchemeData(schemeData);
        io.to(userID).emit('create-scheme', emitData);
    });

    socket.on('edit-scheme', async (data) => {

        const schemeId = data.schemeId;
        const startDate = data.startMonth;
        const endDate = data.endMonth;
        const minAmount = data.amount;

        const query = {
            startDate: startDate,
            endDate: endDate,
            minAmount: minAmount
        }

        await SavingsModel.findByIdAndUpdate(schemeId, query);
        const schemeData = await SavingsModel.findById(schemeId);
    
        const emitData = await fetchSchemeData(schemeData);
        io.to(userID).emit('edit-scheme', emitData);
    });

    socket.on('record-expense', async (data) => {

        const emitData = new Object();
        const budgetId = data.budgetId;
        const amount = data.amount;
        const category = data.category;

        let budget = await BudgetModel.findById(budgetId);

        if(Object.keys(budget).length === 0) {
            emitData.success = false;
            emitData.message = 'The budget you selected does not exist or might have been deleted';
            socket.emit('record-expense', emitData);
            return;
        }
        const categories = budget.categories;
        const categoryBudget = categories[category].budget;
        const totalSpent = categories[category].spent + amount;

        if(totalSpent > categoryBudget) {
            emitData.success = false;
            emitData.message = 'You cannot spend more than your budget. Please increase your budget';
            socket.emit('record-expense', emitData);
            return;
        }

        categories[category].spent = totalSpent;
        await BudgetModel.findByIdAndUpdate(budgetId, {categories: categories});
        const updateData = {
            budgetId: budgetId,
            categories: categories,
            budget: budget.amount
        };
        io.to(userID).emit('update-budget', updateData);

        const d = new Date();
        const date = d.toISOString().slice(0,19).replace('T', ' ');
        const day = d.getDate();
        
        expense = new ExpenseModel({
            userId: userID,
            month: budget.month,
            day,
            category,
            amount,
            date
        });
    
        const expenseData = await expense.save();
        const expenseID = expenseData.id;
        emitData.success = true;
        emitData.expenseId = expenseID;
        emitData.budgetId = budgetId;
        emitData.userId = userID;
        emitData.month = budget.month;
        emitData.day = day;
        emitData.category = category;
        emitData.categories = categories;
        emitData.amount = amount;
        emitData.date = date;
        io.to(userID).emit('record-expense', emitData);
    });

    socket.on('edit-budget', async (data) => {

        const budgetId = data.budgetId;
        const amount = data.budget;
        const categories = data.categories;
        const income = data.income;
        const query = {
            categories: categories,
            amount: amount,
            income: income
        }

        await BudgetModel.findByIdAndUpdate(budgetId, query);
        io.to(userID).emit('edit-budget', data);
    });

    socket.on('add-category', async (data) => {

        const emitData = new Object();

        let category = await CategoryModel.findOne({userId: userID});
        const categoryList = category == null ? new Array() : category.categoryList;
        const hasCategory = categoryList.map(e => e.toLowerCase()).includes(data.categoryName.toLowerCase());

        if(hasCategory) {
            emitData.success = false;
            emitData.message = data.categoryName + ' already exists in your category list';
            socket.emit('add-category', emitData);
            return;
        }
        
        categoryList.push(data.categoryName);
        const categoryData = {
            userId: userID,
            categoryList: categoryList
        };
        
        if(category){
            await CategoryModel.findOneAndReplace({userId: userID}, categoryData);
        } else {
            category = new CategoryModel(categoryData);
            await category.save();
        }
        
        emitData.success = true;
        emitData.categoryName = data.categoryName;
        io.to(userID).emit('add-category', emitData);
    });

    socket.on('delete-category', async (data) => {

        const emitData = new Object();
        const categoryName = data.categoryName;

        let category = await CategoryModel.findOne({userId: userID});
        const categoryList = category.categoryList;
        const index = categoryList.indexOf(categoryName);
        categoryList.splice(index, 1);

        const categoryData = {
            userId: userID,
            categoryList: categoryList
        };
        
        await CategoryModel.findOneAndReplace({userId: userID}, categoryData);
        
        emitData.success = true;
        emitData.categoryName = categoryName;
        io.to(userID).emit('delete-category', emitData);
    });

    socket.on('update-data', async (data) => {

        const emitData = new Object();
        const name = data.name;
        const email = data.email;
        const password = data.password;

        let user = await UserModel.findOne({email});

        if(user) {
            const userId = user._id.toString();
            if(userId != userID){
                emitData.message = 'Email already exists';
                emitData.success = false;
                socket.emit('update-data', emitData);
                return;
            }
        }

        let userX = await UserModel.findById(userID);
        const isMatch = await bcrypt.compare(password, userX.password);
    
        if(!isMatch) {
            emitData.message = 'Your Password is incorrect';
            emitData.success = false;
            socket.emit('update-data', emitData);
            return;
        }

        const query = {
            name,
            email
        }

        await UserModel.findByIdAndUpdate(userID, query);
        emitData.success = true;
        emitData.name = name;
        emitData.email = email;
        io.to(userID).emit('update-data', emitData);
    });

    socket.on('update-password', async (data) => {

        const emitData = new Object();
        const oldPassword = data.oldPassword;
        const newPassword = data.newPassword;

        let user = await UserModel.findById(userID);
        const isMatch = await bcrypt.compare(oldPassword, user.password);
    
        if(!isMatch) {
            emitData.message = 'Your Password is incorrect';
            emitData.success = false;
            socket.emit('update-password', emitData);
            return;
        }

        const hashedPswd = await bcrypt.hash(newPassword, 12);
        const query = {
            password: hashedPswd
        }

        await UserModel.findByIdAndUpdate(userID, query);
        emitData.success = true;
        io.to(userID).emit('update-password', emitData);
    });

    socket.on('switch-option', async (data) => {

        const is2FA = 'allow2FA' in data;
        const setting = await SettingsModel.findOne({userId: userID});
        if(setting){
            const settingId = setting._id.toString();
            await SettingsModel.findByIdAndUpdate(settingId, data);
        } else {
            const settingsData = {
                userId: userID,
                allowBudgetAlert: true,
                allowGoalAlert: true,
                allow2FA: false,
            };
            for(const key in data){
                settingsData[key] = data[key];
            }
            const settings = new SettingsModel(settingsData);        
            await settings.save();
        }

        if(is2FA){
            const isChecked = data.allow2FA;
            let twoFA = await TwoFAModel.findOne({userId: userID});
            if(isChecked && !twoFA){
                const codes = generateAplhaNumera();
                const tFA = new TwoFAModel({
                    userId: userID,
                    codes
                });
                twoFA = await tFA.save();
            }
            if(isChecked)
                data.codes = twoFA.codes;
        }

        io.to(userID).emit('switch-option', data);
    });

    socket.on('delete-budget', async (data) => {
        let spent = 0;
        const emitData = new Object();
        const budgetId = data.budgetId;
        let budget = await BudgetModel.findById(budgetId);

        for (const key in budget.categories) {
            spent += budget.categories[key].spent;
        }

        if(spent > 0){
            emitData.success = false;
            emitData.message = 'You can\'t delete a budget you\'ve already spent from';
            socket.emit('delete-budget', emitData);
            return;
        }
        
        emitData.success = true;
        emitData.budgetId = budgetId;
        await BudgetModel.findByIdAndDelete(budgetId);
        io.to(userID).emit('delete-budget', emitData);
        //socket.broadcast.to(userID).emit('delete-budget', emitData);
    });

    socket.on('delete-scheme', async (data) => {
        const emitData = new Object();
        const schemeId = data.schemeId;
        
        emitData.success = true;
        emitData.schemeId = schemeId;
        await SavingsModel.findByIdAndDelete(schemeId);
        io.to(userID).emit('delete-scheme', emitData);
        //socket.broadcast.to(userID).emit('delete-budget', emitData);
    });

    socket.on('delete-expense', async (emitData) => {
        const amount = emitData.amount;
        const category = emitData.category;
        const budgetId = emitData.budgetId;
        const expenseId = emitData.expenseId;
        let budget = await BudgetModel.findById(budgetId);
        const categories = budget.categories
        categories[category].spent -= amount;
        await ExpenseModel.findByIdAndDelete(expenseId);
        await BudgetModel.findByIdAndUpdate(budgetId, {categories: categories});
        const updateData = {
            budgetId: budgetId,
            categories: categories,
            budget: budget.amount
        };
        io.to(userID).emit('update-budget', updateData);
        socket.broadcast.to(userID).emit('delete-expense', emitData);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        //console.log(connectedUsers);
    });
});

const PORT = 8000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

function getCookie(key, cookie) {
    const nameEQ = key + "=";
    const ca = cookie.split(';');
    for(let i=0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function groupExpense(arrayData){
    const objectData = new Object();
    arrayData.forEach(element => {
        objectData[element.month] = objectData[element.month] || new Array();
        objectData[element.month].push(element);
    });
    return objectData;
}

function budgetAsObject(arrayData){
    const objectData = new Object();
    arrayData.forEach(element => {
        objectData[element.month] = element;
    });
    return objectData;
}

async function fetchSchemeData(scheme) {
    const schemeId = scheme._id;
    const object = new Object(); 
    object.success = true;
    object.schemeId = schemeId;
    object.userId = scheme.userId;
    object.startDate = scheme.startDate;
    object.endDate = scheme.endDate;
    object.minAmount = scheme.minAmount;
    object.date = scheme.date;
    const budget = await BudgetModel.find({userId: scheme.userId}).sort({'month': 'desc'}).exec();
    const budgetData = budgetAsObject(budget);
    
    const schemeStartDate = new Date(scheme.startDate);
    const schemeEndDate = new Date(scheme.endDate);
    const today = new Date() > schemeEndDate ? schemeEndDate : new Date();
    const em = schemeEndDate.getMonth() + 1;
    schemeEndDate.setMonth(em);
    schemeEndDate.setDate(0);
    const tm = today.getMonth() + 1;
    today.setMonth(tm);
    today.setDate(0);
    let schemeIsActive = false;
    const diffInMs = schemeEndDate - schemeStartDate;
    const diffInDays = Math.trunc(diffInMs / 86400000) + 1;
    const diffInMsX = today - schemeStartDate;
    const diffInDaysX = Math.trunc(diffInMsX / 86400000) + 1;
    const monthsBetween = new Array();              
    let currentDate = schemeStartDate;
    let saved = 0;
    let spent = 0;
    let progress = 0;
    let totalIncome = 0;
    
    while(currentDate <= schemeEndDate){
      const newDate = new Date(currentDate);
      const y = newDate.getFullYear();
      const m = String(newDate.getMonth() + 1).padStart(2, '0');;
      monthsBetween.push(`${y}-${m}`);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    for(const month of monthsBetween) {
      if(month in budgetData){
        schemeIsActive = true;
        const budget = budgetData[month];
        totalIncome += budget.income;
        for(const key in budget.categories){
          spent += budget.categories[key].spent;
        }
        saved += budget.income - spent;
      }
    }

    if(saved >= scheme.minAmount) {
      progress = 100;
    } else {
      const sp = (saved / scheme.minAmount) * 100;
      const dp = (diffInDaysX / diffInDays) * 100;
      progress = (sp / dp) * 100;
      progress = progress < 100 ? Math.round(progress) : 100;
    }

    object.progress = progress;
    object.totalIncome = totalIncome;
    object.saved = saved;
    object.spent = spent;
    object.schemeIsActive = schemeIsActive;

    return object;
}

function generateAplhaNumera(length = 6, number = 10) {
    const codes = new Array();
    let count = 0;
    while(count < number){
        let code = '';
        while(code.length < length){
            code += Math.random().toString(36).substring(2);
        }
        code = code.substring(0, length);
        if(!codes.includes(code)){
            codes.push(code);
            count++;
        }
    }
    return codes;
}