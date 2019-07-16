import React from 'react'
import { 
    Button, 
    WhiteSpace,
    InputItem, 
    List, 
    Toast,
    Icon, 
    Grid,
    Flex
} from 'antd-mobile';
import userJson from '../../json/username.json'



class Login extends React.Component {
    state = {
        hasError: false,
        hasErrorPassword: false,
        value: '',
        valuePassword: '',
    }
    onErrorClick = () => {
        if (this.state.hasError) {
            Toast.info('用户名有误');
        }
    }
    onErrorPassword = () => {
        if (this.state.hasErrorPassword) {
            Toast.info('密码长度必须是3-18之间的数字、字母、特殊符号');
        }
    }
    onChange = (value) => {
        if (value.replace(/\s/g, '').length < 11) {
            this.setState({
                hasError: true,
            });
        } else {
            this.setState({
                hasError: false,
            });
        }
        this.setState({
            value,
        });
    }
    onChangePassword = (valuePassword) => {
        if (valuePassword.length < 3) {
            this.setState({
                hasErrorPassword: true,
            });
        } else {
            this.setState({
                hasErrorPassword: false,
            });
        }
        this.setState({
            valuePassword,
        })
    }
    componentDidMount(){
        console.log(typeof userJson.password)
    }
    clickUpIn(){
        // console.log(this.refs.username.state.value);
        const userNameValue = this.refs.username.state.value;
        const passWordValue = this.refs.password.state.value;
        if(userJson.username === userNameValue){
            if( userJson.password === passWordValue){
                localStorage.userName = userNameValue;
                localStorage.passWord = passWordValue;
                this.props.history.push("/personal");
                console.log(1111);
            }else{
                Toast.fail('密码错误');
            }
        }else{
            Toast.fail('用户名错误');
        }
    }
    dropOut = ()=>{
        if(localStorage.userName){
            this.props.history.go(-1)
        }
    }
    render() {
        return (
            <div style={{backgroundColor:"#fff",}}>
                <div style={{padding:'30px'}}>
                    <Flex>
                        <Flex.Item><Icon type="left" size="lg" onClick={this.dropOut}/></Flex.Item>
                        <Flex.Item justify="center" align="center" style={{fontSize:'17px'}}>京东登录</Flex.Item>
                        <Flex.Item></Flex.Item>
                    </Flex>
                    <List>
                        <InputItem
                            type="text"
                            clear="true"
                            ref="username"
                            maxLength="11"
                            placeholder="用户名/邮箱/已验证手机"
                            error={this.state.hasError}
                            onErrorClick={this.onErrorClick}
                            onChange={this.onChange}
                            value={this.state.value}
                        ></InputItem>
                        <InputItem
                            type="password"
                            clear="true"
                            ref="password"
                            maxLength="18"
                            placeholder="请输入密码"
                            extra="|&nbsp;&nbsp;&nbsp;忘记密码"
                            error={this.state.hasErrorPassword}
                            onErrorClick={this.onErrorPassword}
                            onChange={this.onChangePassword}
                            value={this.state.valuePassword}
                        ></InputItem>
                    </List>
                    <Button 
                        type="warning"
                        ref="upIn"
                        disabled={this.state.value&&this.state.valuePassword?false:true}
                        style={{marginTop:'30px',borderRadius:'23.5px'}}
                        onClick={this.clickUpIn.bind(this)}
                        >登录</Button><WhiteSpace />
                        <Button 
                        onClick={()=>{
                            localStorage.userName = userJson.username;
                            localStorage.passWord = userJson.password;
                            this.props.history.push("/personal");
                        }}
                        style={{color:'#ff2000',border:'1px solid #ff2000',borderRadius:'23.5px'}}
                        >一键登录</Button><WhiteSpace />
                </div>
            </div>
        );
    }
}

export default Login;