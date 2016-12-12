#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script to pre-populate the database
"""
import hashlib
from sqlalchemy_utils.functions import create_database, database_exists
from DB.api import user, gateway, sensor_type
from DB.api import database
from DB import exception
from utils.config import config

try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    pass


def hash_str(raw_str):
    return hashlib.sha256(raw_str).hexdigest()

DEFAULT_GATEWAYS = [
    {
        'name': 'lab',
        'url': 'http://10.239.115.34:8882/',
        'address': 'No. 880, Zi Xing Rd, Shanghai',
        'latitude': '31.020780',
        'longitude': '121.454648',
        'status': True
    },
    {
        'name': 'demo',
        'url': 'https://192.55.66.110:8000/',
        'address': 'Manchester Grand Hyatt San Diego',
        'latitude': '32.714987',
        'longitude': ' -117.167359',
        'status': True
    },
]

DEFAULT_USERS = [
    {
        'username': 'dev',
        'password': hash_str('dev'),
        'gateway_id': 1,
    },
    {
        'username': 'ostro',
        'password': hash_str('ostro'),
        'gateway_id': 2,
    },
]

SENSOR_TYPES = [
    'fan',
    'motion',
    'gas',
    'solar',
    'illuminance',
    'buzzer',
    'temperature',
    'rgbled',
    'led',
    'button',
    'power'
]


def new_database():
    engine = config.get_connection_url()
    if not database_exists(engine):
        print "Create database " + engine
        create_database(engine)
        return True
    elif not database.check_tables():
        print "Check tables and incomplete tables."
        return True
    return False


def create_tables():
    print "Truncate the database if it exists..."
    database.drop_db()
    print "Create the database tables ..."
    database.create_db()


def init_data():
    print "Init gateway data ..."
    for gw in DEFAULT_GATEWAYS:
        gateway.add_gateway(gw)
    print "Init user data ..."
    for usr in DEFAULT_USERS:
        user.add_user(usr)
    print "Init sensor type data ..."
    for st in SENSOR_TYPES:
        sensor_type.add_sensor_type({'type': st})
    print "Done."


if __name__ == "__main__":
    try:
        if new_database():
            create_tables()
            init_data()
    except exception.DatabaseException as e:
        print e.message

