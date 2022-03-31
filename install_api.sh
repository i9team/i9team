#!/bin/bash

## OBS => Se o script não iniciar utilize o comando para matar a PID do apt-get: sudo fuser -vki /var/lib/dpkg/lock; sudo dpkg --configure -a ##

sudo apt-get install figlet &> /dev/null

red=`tput setaf 1`
green=`tput setaf 2`
magenta=`tput setaf 5`
yellow=`tput setaf 3`

figlet "Jef API"

printf "${magenta}====================={ INICIANDO AS CONFIGURAÇÃO DO SERVIDOR }=====================\n\n"



## Atualizando o repositório ##
printf "${green}**************{ Atualizando o repositórios }**************\n\n"
sudo apt update -y &> /dev/null

## Instalando o Node.JS ##
printf "${green}**************{ Instalando o Node.JS }**************\n\n"
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - &> /dev/null
sudo apt-get install -y nodejs &> /dev/null

## Instalando NPM ##
printf "${green}**************{ Instalando NPM }**************\n\n"
sudo apt-get install npm -y &> /dev/null

## Instalando o PM2 ##
printf "${green}**************{ Instalando o PM2 }**************\n\n"
npm install -g pm2 &> /dev/null

## Finalização, atualização e limpeza##
printf "${green}**************{ Atualizando o servidor }**************\n\n"
sudo apt update &> /dev/null

## Instalando a API do Pedro Herpeto
printf "${magenta}====================={ INICIANDO INSTALAÇÃO DA API }=====================\n\n"
git clone https://github.com/i9team/i9team.git &> /dev/null
mkdir wppapi
mv i9team/* ./wppapi
rm -r i9team
cd wppapi

## Instalando Chromium ##
printf "${green}**************{ Instalando Chromium }**************\n\n"
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb &> /dev/null
sudo dpkg -i google-chrome-stable_current_amd64.deb &> /dev/null
sudo apt-get install -f -y > /dev/null

printf "${green}**************{ Instalando @i9teamAPI }**************\n\n"
npm install &> /dev/null

## Habilitando Chromium ##
printf "${green}**************{ Habilitando Chromium }**************\n\n"
node node_modules/puppeteer/install.js > /dev/null

printf "${yellow}====================={ Instalação finalizada }=====================\n\n"
