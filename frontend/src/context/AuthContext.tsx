/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';
import claimsApi from '../client/apiClient'; // the initialized axios instance

interface User {
    username: string;
    role: 'HOSPITAL' | 'INSURER' | 'ADMIN';
}

interface AuthContextType {
    user: User | null;
    login: (user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        const storedUser = localStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });

    const login = (newUser: User) => {
        setUser(newUser);
        localStorage.setItem('user', JSON.stringify(newUser));
    };

    const logout = async () => {
        setUser(null);
        localStorage.removeItem('user');
        try {
            await claimsApi.post('/auth/logout');
        } catch (e) {
            console.error('Logout error', e);
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            login,
            logout,
            isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
